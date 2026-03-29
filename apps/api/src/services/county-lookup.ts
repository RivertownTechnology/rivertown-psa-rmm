/**
 * Look up county from address using the US Census Bureau Geocoder API (free, no key needed).
 * Falls back to a simple zip→county lookup if geocoding fails.
 */

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/address';

export async function lookupCounty(address: string, city: string, state: string, zip: string): Promise<string | null> {
  // Try Census Geocoder first
  try {
    const params = new URLSearchParams({
      street: address,
      city,
      state,
      zip,
      benchmark: 'Public_AR_Current',
      vintage: 'Current_Current',
      format: 'json',
    });

    const res = await fetch(`${CENSUS_URL}?${params}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json() as {
        result: {
          addressMatches: Array<{
            geographies: {
              Counties?: Array<{ BASENAME: string; NAME: string }>;
            };
          }>;
        };
      };

      const match = data.result?.addressMatches?.[0];
      const county = match?.geographies?.Counties?.[0];
      if (county) {
        // Returns just the county name without "County" suffix
        const name = county.BASENAME || county.NAME;
        return name.replace(/\s+County$/i, '').trim();
      }
    }
  } catch (err) {
    console.log('[COUNTY] Census geocoder failed, trying zip lookup:', (err as Error).message);
  }

  // Fallback: try with just zip
  try {
    const params = new URLSearchParams({
      street: address || '100 Main St',
      zip,
      benchmark: 'Public_AR_Current',
      vintage: 'Current_Current',
      format: 'json',
    });

    const res = await fetch(`${CENSUS_URL}?${params}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json() as any;
      const county = data.result?.addressMatches?.[0]?.geographies?.Counties?.[0];
      if (county) {
        return (county.BASENAME || county.NAME).replace(/\s+County$/i, '').trim();
      }
    }
  } catch { /* ignore */ }

  return null;
}
