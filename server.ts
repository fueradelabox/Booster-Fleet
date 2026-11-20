import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  createPublicClient,
  createWalletClient,
  http as viemHttp,
  keccak256,
  recoverMessageAddress,
  toHex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { normalizeTeltonikaPayload } from './src/utils/logisticsEngine.ts';
import type { TeltonikaPacket } from './src/types/logistics.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

// Persistent runtime attestation signer for ECDSA verification when live RPC/private key aren't set
const runtimeAttestationKey = (
  process.env.BLOCKCHAIN_PRIVATE_KEY &&
  process.env.BLOCKCHAIN_PRIVATE_KEY.startsWith('0x') &&
  process.env.BLOCKCHAIN_PRIVATE_KEY.length === 66
    ? process.env.BLOCKCHAIN_PRIVATE_KEY
    : generatePrivateKey()
) as `0x${string}`;
const attestationAccount = privateKeyToAccount(runtimeAttestationKey);

const latestTelemetryByImei = new Map<string, TeltonikaPacket>();

function getMapsApiKey(): string {
  return (
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    ''
  );
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY no está configurada. Revisa la configuración de secretos en Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function hasLiveEvmConfig(): boolean {
  return Boolean(
    process.env.BLOCKCHAIN_RPC_URL &&
      process.env.BLOCKCHAIN_PRIVATE_KEY &&
      process.env.BLOCKCHAIN_PRIVATE_KEY.startsWith('0x') &&
      process.env.BLOCKCHAIN_PRIVATE_KEY.length === 66
  );
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/telemetry' });

  const broadcastWs = (event: string, payload: unknown) => {
    const serialized = JSON.stringify({ event, payload, serverTime: new Date().toISOString() });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    });
  };

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        event: 'telemetry:init',
        payload: Array.from(latestTelemetryByImei.values()),
        serverTime: new Date().toISOString(),
      })
    );
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      mapsConfigured: Boolean(getMapsApiKey()),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      evmOnChainConfigured: hasLiveEvmConfig(),
      carbonRegistryConfigured: Boolean(
        process.env.PATCH_API_KEY || process.env.CNAUGHT_API_KEY
      ),
    });
  });

  app.get('/api/maps-config', (_req: Request, res: Response) => {
    res.json({
      apiKey: getMapsApiKey(),
    });
  });

  // Real Teltonika AVL / HTTP Gateway Telemetry Ingestion Endpoint
  app.post('/api/telemetry/teltonika', (req: Request, res: Response) => {
    const expectedSecret = process.env.TELTONIKA_WEBHOOK_SECRET;
    if (expectedSecret) {
      const providedSecret = req.header('x-teltonika-secret');
      if (providedSecret !== expectedSecret) {
        res.status(401).json({ error: 'Token Teltonika inválido o ausente.' });
        return;
      }
    }

    const parsed = normalizeTeltonikaPayload(
      (req.body ?? {}) as Record<string, unknown>
    );
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    latestTelemetryByImei.set(parsed.packet.imei, parsed.packet);
    broadcastWs('telemetry:update', parsed.packet);

    res.status(202).json({
      ok: true,
      acceptedAt: new Date().toISOString(),
      packet: parsed.packet,
    });
  });

  app.get('/api/telemetry/latest', (_req: Request, res: Response) => {
    res.json({
      packets: Array.from(latestTelemetryByImei.values()),
    });
  });

  // Capa B: Real Carbon Credit Retirement Integration (Patch.io / CNaught / Pending Registry Settlement)
  app.post('/api/carbon/retire', async (req: Request, res: Response) => {
    const {
      co2Kg,
      projectId,
      patchProjectId,
      registryCode,
      shipmentCode,
    } = req.body as {
      co2Kg?: number;
      projectId?: string;
      patchProjectId?: string;
      registryCode?: string;
      shipmentCode?: string;
    };

    const safeKg = Number(co2Kg ?? 0);
    if (!Number.isFinite(safeKg) || safeKg <= 0) {
      res.status(400).json({ error: 'Cantidad de CO₂e inválida para compensación.' });
      return;
    }

    const massGrams = Math.max(100, Math.round(safeKg * 1000));
    const patchKey = process.env.PATCH_API_KEY;
    const cnaughtKey = process.env.CNAUGHT_API_KEY;

    if (patchKey) {
      try {
        const patchPayload: Record<string, unknown> = {
          mass_g: massGrams,
          metadata: {
            platform: 'TerraCarga',
            shipmentCode: shipmentCode || 'N/A',
            registryCode: registryCode || '',
          },
        };
        if (patchProjectId) {
          patchPayload.project_id = patchProjectId;
        }
        const patchRes = await fetch('https://api.patch.io/v1/orders', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${patchKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(patchPayload),
        });
        const patchJson = (await patchRes.json()) as {
          data?: { id?: string; state?: string };
          error?: { message?: string };
        };
        if (patchRes.ok && patchJson?.data?.id) {
          res.json({
            registryProvider: 'Patch.io (Verra / Gold Standard)',
            registryOrderId: patchJson.data.id,
            registryStatus: 'retired_verified',
          });
          return;
        }
        res.status(502).json({
          error:
            patchJson?.error?.message ||
            'Error al ejecutar orden real de retiro en Patch.io.',
        });
        return;
      } catch (err) {
        res.status(502).json({
          error:
            err instanceof Error
              ? err.message
              : 'Fallo de red conectando con Patch.io.',
        });
        return;
      }
    }

    if (cnaughtKey) {
      try {
        const cnRes = await fetch('https://api.cnaught.com/v1/orders', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cnaughtKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount_kg: Number(safeKg.toFixed(2)),
            metadata: { shipmentCode: shipmentCode || '', projectId: projectId || '' },
          }),
        });
        const cnJson = (await cnRes.json()) as { id?: string; message?: string };
        if (cnRes.ok && cnJson?.id) {
          res.json({
            registryProvider: 'CNaught Carbon Registry',
            registryOrderId: cnJson.id,
            registryStatus: 'retired_verified',
          });
          return;
        }
        res.status(502).json({
          error: cnJson?.message || 'Error al ejecutar orden en CNaught.',
        });
        return;
      } catch (err) {
        res.status(502).json({
          error:
            err instanceof Error
              ? err.message
              : 'Fallo de red conectando con CNaught.',
        });
        return;
      }
    }

    // Transparent reservation mode when external carbon registry API key isn't supplied
    res.json({
      registryProvider: `${registryCode || 'Verra VCS'} · Reserva Corporativa (Sin API Key externa)`,
      registryOrderId: `RES-${(shipmentCode || 'TC').replace(/[^A-Z0-9]/gi, '')}-${Date.now().toString().slice(-6)}`,
      registryStatus: 'pending_registry_settlement',
    });
  });

  // Capa B: Real EVM Blockchain Status, Anchoring & Cryptographic Verification via viem
  app.get('/api/blockchain/status', (_req: Request, res: Response) => {
    const live = hasLiveEvmConfig();
    res.json({
      evmOnChainEnabled: live,
      signerAddress: attestationAccount.address,
      networkName: live
        ? process.env.BLOCKCHAIN_NETWORK_NAME || 'EVM RPC Conectado (Polygon / Base)'
        : 'Atestación Criptográfica ECDSA (Listo para EVM RPC)',
      explorerUrl: process.env.BLOCKCHAIN_EXPLORER_URL || 'https://amoy.polygonscan.com',
      carbonRegistryEnabled: Boolean(
        process.env.PATCH_API_KEY || process.env.CNAUGHT_API_KEY
      ),
    });
  });

  app.post('/api/blockchain/anchor', async (req: Request, res: Response) => {
    const {
      shipmentId,
      shipmentCode,
      teltonikaImei,
      distanceKm,
      fuelConsumedLiters,
      co2CompensatedKg,
      projectId,
      registryCode,
      issuedAtIso,
    } = req.body as Record<string, unknown>;

    const canonicalPayload = JSON.stringify({
      platform: 'TerraCarga',
      version: '1.0',
      shipmentId: String(shipmentId ?? ''),
      shipmentCode: String(shipmentCode ?? ''),
      teltonikaImei: String(teltonikaImei ?? ''),
      distanceKm: Number(distanceKm ?? 0).toFixed(2),
      fuelConsumedLiters: Number(fuelConsumedLiters ?? 0).toFixed(2),
      co2CompensatedKg: Number(co2CompensatedKg ?? 0).toFixed(2),
      projectId: String(projectId ?? ''),
      registryCode: String(registryCode ?? ''),
      issuedAtIso: String(issuedAtIso ?? new Date().toISOString()),
    });

    const digest = keccak256(toHex(canonicalPayload));
    const signature = await attestationAccount.signMessage({
      message: `TerraCarga-ESG:${digest}`,
    });

    if (hasLiveEvmConfig()) {
      try {
        const rpcUrl = process.env.BLOCKCHAIN_RPC_URL as string;
        const explorerBase = (
          process.env.BLOCKCHAIN_EXPLORER_URL || 'https://amoy.polygonscan.com'
        ).replace(/\/$/, '');

        const publicClient = createPublicClient({
          transport: viemHttp(rpcUrl),
        });
        const chainId = await publicClient.getChainId();
        const walletClient = createWalletClient({
          account: attestationAccount,
          transport: viemHttp(rpcUrl),
        });

        const txHash = await walletClient.sendTransaction({
          account: attestationAccount,
          chain: null,
          to: attestationAccount.address,
          value: 0n,
          data: toHex(canonicalPayload),
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: 30_000,
        });

        res.json({
          anchorMode: 'evm_onchain',
          txHash,
          blockNumber: Number(receipt.blockNumber),
          chainId,
          networkName:
            process.env.BLOCKCHAIN_NETWORK_NAME || `EVM Chain #${chainId}`,
          explorerUrl: `${explorerBase}/tx/${txHash}`,
          signature,
          signerAddress: attestationAccount.address,
          digest,
        });
        return;
      } catch (err) {
        res.status(502).json({
          error:
            err instanceof Error
              ? `Error anclando transacción en EVM RPC: ${err.message}`
              : 'Error ejecutando transacción EVM.',
        });
        return;
      }
    }

    // Verified ECDSA cryptographic attestation using keccak256 + secp256k1 signature
    res.json({
      anchorMode: 'ecdsa_attestation',
      txHash: digest,
      blockNumber: 0,
      networkName: 'ECDSA secp256k1 · Listo para anclaje Polygon/Base',
      signature,
      signerAddress: attestationAccount.address,
      digest,
    });
  });

  app.post('/api/blockchain/verify', async (req: Request, res: Response) => {
    const { txHash, signature, signerAddress, digest } = req.body as {
      txHash?: string;
      signature?: string;
      signerAddress?: string;
      digest?: string;
    };

    try {
      if (signature && signerAddress && (digest || txHash)) {
        const targetDigest = digest || txHash;
        const recovered = await recoverMessageAddress({
          message: `TerraCarga-ESG:${targetDigest}`,
          signature: signature as `0x${string}`,
        });
        const valid =
          recovered.toLowerCase() === signerAddress.toLowerCase();
        res.json({
          verified: valid,
          mode: 'ecdsa_attestation',
          recoveredAddress: recovered,
        });
        return;
      }

      if (hasLiveEvmConfig() && txHash && txHash.startsWith('0x')) {
        const publicClient = createPublicClient({
          transport: viemHttp(process.env.BLOCKCHAIN_RPC_URL as string),
        });
        const receipt = await publicClient.getTransactionReceipt({
          hash: txHash as `0x${string}`,
        });
        res.json({
          verified: receipt.status === 'success',
          mode: 'evm_onchain',
          blockNumber: Number(receipt.blockNumber),
        });
        return;
      }

      res.json({
        verified: Boolean(txHash && /^0x[0-9a-fA-F]{64}$/.test(txHash)),
        mode: 'hash_format',
      });
    } catch (err) {
      res.status(400).json({
        verified: false,
        error: err instanceof Error ? err.message : 'No se pudo verificar firma.',
      });
    }
  });

  // Server-side proxy for Google Maps Routes API (eco-friendly routing + fuel consumption + tolls)
  app.post('/api/routes/eco', async (req: Request, res: Response) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(400).json({
        error: 'Clave de Google Maps Platform no configurada en el servidor.',
      });
      return;
    }

    const { origin, destination, emissionType } = req.body as {
      origin?: { lat: number; lng: number } | string;
      destination?: { lat: number; lng: number } | string;
      emissionType?: 'DIESEL' | 'GASOLINE' | 'HYBRID' | 'ELECTRIC';
    };

    if (!origin || !destination) {
      res.status(400).json({
        error: 'Se requieren origen y destino para calcular la ruta eco-eficiente.',
      });
      return;
    }

    const formatWaypoint = (loc: { lat: number; lng: number } | string) =>
      typeof loc === 'string'
        ? { address: loc }
        : {
            location: {
              latLng: { latitude: loc.lat, longitude: loc.lng },
            },
          };

    const validEmission =
      emissionType && ['DIESEL', 'GASOLINE', 'HYBRID', 'ELECTRIC'].includes(emissionType)
        ? emissionType
        : 'DIESEL';

    try {
      const response = await fetch(
        'https://routes.googleapis.com/directions/v2:computeRoutes',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
            'X-Goog-FieldMask':
              'routes.duration,routes.staticDuration,routes.distanceMeters,routes.routeLabels,routes.travelAdvisory.fuelConsumptionMicroliters,routes.travelAdvisory.tollInfo,routes.polyline.encodedPolyline',
          },
          body: JSON.stringify({
            origin: formatWaypoint(origin),
            destination: formatWaypoint(destination),
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
            extraComputations: ['FUEL_CONSUMPTION', 'TOLLS'],
            routeModifiers: {
              vehicleInfo: {
                emissionType: validEmission,
              },
            },
            requestedReferenceRoutes: ['FUEL_EFFICIENT'],
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        const message =
          data?.error?.message ||
          `Error de Routes API (${response.status}). Verifica que Routes API esté habilitada en tu proyecto.`;
        res.status(response.status).json({ error: message, details: data?.error });
        return;
      }

      res.json({ routes: data.routes ?? [] });
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'No fue posible consultar Google Maps Routes API.',
      });
    }
  });

  // High-Thinking ML Logistics Optimization & Predictive ETA via gemini-4-carbon
  app.post('/api/ai/route-intelligence', async (req: Request, res: Response) => {
    try {
      const ai = getAiClient();
      const {
        originName,
        destinationName,
        distanceKm,
        trafficDelayPct,
        payloadTons,
        fuelType,
        teltonikaSpeedKmh,
        teltonikaFuelPct,
        odometerKm,
        nextServiceKm,
        availableBackhaulTitle,
      } = req.body as Record<string, unknown>;

      const prompt = `Analiza este despacho de carga pesada y genera una estrategia integral de optimización operativa y ambiental en español:
- Corredor: ${String(originName)} -> ${String(destinationName)}
- Distancia estimada: ${String(distanceKm)} km
- Retraso de tráfico en tiempo real: ${String(trafficDelayPct)}%
- Carga útil: ${String(payloadTons)} toneladas
- Tren motriz / Combustible: ${String(fuelType)}
- Telemetría Teltonika GPS/CAN-bus: velocidad actual ${String(teltonikaSpeedKmh)} km/h, combustible ${String(teltonikaFuelPct)}%, odómetro ${String(odometerKm)} km (próxima mantención a los ${String(nextServiceKm)} km)
- Oportunidad de carga de retorno (ruta vacía): ${String(availableBackhaulTitle || 'Ninguna detectada')}

Entrega un informe conciso y accionable estructurado con:
1. ETA Predictivo (ventana optimista, esperada y conservadora con justificación de tráfico).
2. Optimización de Consumo y Ruta Eco-Eficiente (tácticas concretas de velocidad crucero, manejo de pendientes y ahorro estimado de combustible y CO₂e).
3. Estrategia de Retorno sin Ruta Vacía y Continuidad de Flota (evaluación de mantención preventiva Teltonika y aprovechamiento de carga de retorno).
4. Recomendación de Compensación Certificada y Cumplimiento ESG (Scope 1 y Scope 3).`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-carbon',
        contents: prompt,
        config: {
          systemInstruction:
            'Eres un ingeniero senior de optimización logística, telemetría de flotas Teltonika y descarbonización de transporte pesado. Responde siempre en español claro, técnico y preciso, sin adornos innecesarios.',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
        },
      });

      res.json({
        model: 'gemini-4-carbon',
        thinkingLevel: 'HIGH',
        analysis: response.text ?? '',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error al ejecutar análisis de ruta.';
      const status =
        message.includes('API_KEY') || message.includes('PERMISSION_DENIED')
          ? 403
          : 500;
      res.status(status).json({ error: message });
    }
  });

  // Google Maps Grounding via gemini-4-hydrogen with googleMaps tool
  app.post('/api/ai/maps-grounding', async (req: Request, res: Response) => {
    try {
      const ai = getAiClient();
      const { query, latitude, longitude } = req.body as {
        query?: string;
        latitude?: number;
        longitude?: number;
      };

      if (!query || !query.trim()) {
        res.status(400).json({ error: 'Ingresa una consulta geográfica para buscar en el corredor.' });
        return;
      }

      const lat = typeof latitude === 'number' ? latitude : 20.5888;
      const lng = typeof longitude === 'number' ? longitude : -100.3899;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `${query}. Responde en español pensando en un operador de transporte de carga pesada.`,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: {
                latitude: lat,
                longitude: lng,
              },
            },
          },
        },
      });

      const chunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

      const groundingLinks = chunks
        .filter((c) => c.maps?.uri)
        .map((c) => ({
          title: c.maps?.title || 'Ubicación en Google Maps',
          uri: c.maps?.uri || '',
          snippets:
            c.maps?.placeAnswerSources?.reviewSnippets
              ?.map((s) => s.reviewId || '')
              .filter(Boolean) ?? [],
        }));

      res.json({
        model: 'gemini-4-hydrogen',
        text: response.text ?? '',
        groundingLinks,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error en consulta de Google Maps Grounding.';
      res.status(500).json({ error: message });
    }
  });

  // 24/7 Support & Teltonika Diagnostics Assistant
  app.post('/api/ai/support', async (req: Request, res: Response) => {
    try {
      const ai = getAiClient();
      const { subject, category, details } = req.body as {
        subject?: string;
        category?: string;
        details?: string;
      };

      if (!subject || !details) {
        res.status(400).json({ error: 'Asunto y descripción son obligatorios.' });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Caso de soporte 24/7 categoría "${category ?? 'General'}": ${subject}\nDetalle: ${details}\nGenera un diagnóstico técnico inmediato y pasos de resolución en máximo 4 puntos breves en español.`,
      });

      res.json({
        diagnostic: response.text ?? '',
      });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'No se pudo generar diagnóstico automático.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TerraCarga MVP server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
