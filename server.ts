import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      mapsConfigured: Boolean(getMapsApiKey()),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.get('/api/maps-config', (_req: Request, res: Response) => {
    res.json({
      apiKey: getMapsApiKey(),
    });
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TerraCarga server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
