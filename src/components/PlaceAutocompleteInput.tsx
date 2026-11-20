import React, { useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import type { LatLngLiteral } from '../types/logistics';

interface PlaceAutocompleteInputProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  mapsAvailable?: boolean;
  onChangeText: (text: string) => void;
  onSelectPlace: (place: { name: string; coords: LatLngLiteral }) => void;
}

const PlacesAutocompleteConnected: React.FC<
  Omit<PlaceAutocompleteInputProps, 'mapsAvailable'>
> = ({ id, label, value, placeholder, onChangeText, onSelectPlace }) => {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [suggestions, setSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!placesLib || !open) return;
    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }
        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmed,
          sessionToken: sessionTokenRef.current,
          language: 'es',
        });
        setSuggestions(res.suggestions ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 240);

    return () => clearTimeout(timer);
  }, [placesLib, value, open]);

  const handleSelect = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => {
    if (!suggestion.placePrediction) return;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
      });
      const loc = place.location;
      const labelText =
        place.formattedAddress ||
        place.displayName ||
        suggestion.placePrediction.text.text;
      onChangeText(labelText);
      if (loc) {
        onSelectPlace({
          name: labelText,
          coords: { lat: loc.lat(), lng: loc.lng() },
        });
      }
    } finally {
      sessionTokenRef.current = null;
      setSuggestions([]);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <label
        htmlFor={id}
        className="block text-xs font-medium text-slate-700 mb-1"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        onChange={(e) => {
          onChangeText(e.target.value);
          setOpen(true);
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
      />
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label={`Sugerencias para ${label}`}
          className="absolute z-40 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100"
        >
          {suggestions.map((s, idx) => (
            <li key={idx}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void handleSelect(s);
                }}
                className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {s.placePrediction?.text.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const PlaceAutocompleteInput: React.FC<PlaceAutocompleteInputProps> = ({
  mapsAvailable = true,
  ...rest
}) => {
  if (!mapsAvailable) {
    return (
      <div>
        <label
          htmlFor={rest.id}
          className="block text-xs font-medium text-slate-700 mb-1"
        >
          {rest.label}
        </label>
        <input
          id={rest.id}
          type="text"
          value={rest.value}
          onChange={(e) => rest.onChangeText(e.target.value)}
          placeholder={rest.placeholder}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
        />
      </div>
    );
  }
  return <PlacesAutocompleteConnected {...rest} />;
};
