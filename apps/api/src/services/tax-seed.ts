/**
 * South Carolina and North Carolina county sales tax rates (2026).
 * Combined rate = state rate + county/local rate.
 *
 * SC: 6% state + 1-3% local (varies by county, most are 1-2%)
 * NC: 4.75% state + 2-2.75% local (varies by county)
 */

interface TaxSeedRate {
  state: string;
  county: string | null;
  combinedRate: string;
  stateRate: string;
  countyRate: string;
  appliesToProducts: boolean;
  appliesToServices: boolean;
}

export function getSCNCTaxRates(): TaxSeedRate[] {
  const rates: TaxSeedRate[] = [];

  // --- SOUTH CAROLINA ---
  // State rate: 6%, most counties add 1-2% local
  const scState = '6.0000';
  const scCounties: [string, string][] = [
    // [county, local rate]
    ['Abbeville', '1.0000'],
    ['Aiken', '2.0000'],
    ['Allendale', '2.0000'],
    ['Anderson', '1.0000'],
    ['Bamberg', '2.0000'],
    ['Barnwell', '2.0000'],
    ['Beaufort', '1.0000'],
    ['Berkeley', '2.5000'],
    ['Calhoun', '1.0000'],
    ['Charleston', '2.5000'],
    ['Cherokee', '2.0000'],
    ['Chester', '2.0000'],
    ['Chesterfield', '1.0000'],
    ['Clarendon', '2.0000'],
    ['Colleton', '2.0000'],
    ['Darlington', '2.0000'],
    ['Dillon', '2.0000'],
    ['Dorchester', '2.0000'],
    ['Edgefield', '2.0000'],
    ['Fairfield', '2.0000'],
    ['Florence', '2.0000'],
    ['Georgetown', '2.0000'],
    ['Greenville', '1.0000'],
    ['Greenwood', '2.0000'],
    ['Hampton', '3.0000'],
    ['Horry', '2.0000'],
    ['Jasper', '3.0000'],
    ['Kershaw', '2.0000'],
    ['Lancaster', '2.0000'],
    ['Laurens', '2.0000'],
    ['Lee', '2.0000'],
    ['Lexington', '2.0000'],
    ['Marion', '2.0000'],
    ['Marlboro', '2.0000'],
    ['McCormick', '1.0000'],
    ['Newberry', '2.0000'],
    ['Oconee', '1.0000'],
    ['Orangeburg', '2.0000'],
    ['Pickens', '1.0000'],
    ['Richland', '2.0000'],
    ['Saluda', '2.0000'],
    ['Spartanburg', '1.0000'],
    ['Sumter', '2.0000'],
    ['Union', '2.0000'],
    ['Williamsburg', '2.0000'],
    ['York', '2.0000'],
  ];

  // SC state-level default
  rates.push({
    state: 'SC', county: null,
    combinedRate: scState, stateRate: scState, countyRate: '0.0000',
    appliesToProducts: true, appliesToServices: false,
  });

  for (const [county, local] of scCounties) {
    const combined = (parseFloat(scState) + parseFloat(local)).toFixed(4);
    rates.push({
      state: 'SC', county,
      combinedRate: combined, stateRate: scState, countyRate: local,
      appliesToProducts: true, appliesToServices: false,
    });
  }

  // --- NORTH CAROLINA ---
  // State rate: 4.75%, all counties add local
  const ncState = '4.7500';
  const ncCounties: [string, string][] = [
    ['Alamance', '2.2500'],
    ['Alexander', '2.2500'],
    ['Alleghany', '2.2500'],
    ['Anson', '2.2500'],
    ['Ashe', '2.2500'],
    ['Avery', '2.2500'],
    ['Beaufort', '2.2500'],
    ['Bertie', '2.2500'],
    ['Bladen', '2.2500'],
    ['Brunswick', '2.2500'],
    ['Buncombe', '2.2500'],
    ['Burke', '2.2500'],
    ['Cabarrus', '2.2500'],
    ['Caldwell', '2.2500'],
    ['Camden', '2.2500'],
    ['Carteret', '2.2500'],
    ['Caswell', '2.2500'],
    ['Catawba', '2.5000'],
    ['Chatham', '2.2500'],
    ['Cherokee', '2.2500'],
    ['Chowan', '2.2500'],
    ['Clay', '2.2500'],
    ['Cleveland', '2.2500'],
    ['Columbus', '2.2500'],
    ['Craven', '2.2500'],
    ['Cumberland', '2.2500'],
    ['Currituck', '2.2500'],
    ['Dare', '2.2500'],
    ['Davidson', '2.2500'],
    ['Davie', '2.2500'],
    ['Duplin', '2.7500'],
    ['Durham', '2.5000'],
    ['Edgecombe', '2.2500'],
    ['Forsyth', '2.2500'],
    ['Franklin', '2.2500'],
    ['Gaston', '2.2500'],
    ['Gates', '2.2500'],
    ['Graham', '2.2500'],
    ['Granville', '2.2500'],
    ['Greene', '2.7500'],
    ['Guilford', '2.2500'],
    ['Halifax', '2.2500'],
    ['Harnett', '2.2500'],
    ['Haywood', '2.2500'],
    ['Henderson', '2.2500'],
    ['Hertford', '2.2500'],
    ['Hoke', '2.2500'],
    ['Hyde', '2.2500'],
    ['Iredell', '2.2500'],
    ['Jackson', '2.7500'],
    ['Johnston', '2.2500'],
    ['Jones', '2.7500'],
    ['Lee', '2.2500'],
    ['Lenoir', '2.2500'],
    ['Lincoln', '2.2500'],
    ['Macon', '2.2500'],
    ['Madison', '2.2500'],
    ['Martin', '2.2500'],
    ['McDowell', '2.2500'],
    ['Mecklenburg', '2.5000'],
    ['Mitchell', '2.2500'],
    ['Montgomery', '2.2500'],
    ['Moore', '2.2500'],
    ['Nash', '2.2500'],
    ['New Hanover', '2.2500'],
    ['Northampton', '2.2500'],
    ['Onslow', '2.2500'],
    ['Orange', '2.5000'],
    ['Pamlico', '2.2500'],
    ['Pasquotank', '2.2500'],
    ['Pender', '2.2500'],
    ['Perquimans', '2.2500'],
    ['Person', '2.2500'],
    ['Pitt', '2.2500'],
    ['Polk', '2.2500'],
    ['Randolph', '2.2500'],
    ['Richmond', '2.2500'],
    ['Robeson', '2.2500'],
    ['Rockingham', '2.2500'],
    ['Rowan', '2.5000'],
    ['Rutherford', '2.2500'],
    ['Sampson', '2.7500'],
    ['Scotland', '2.2500'],
    ['Stanly', '2.2500'],
    ['Stokes', '2.2500'],
    ['Surry', '2.5000'],
    ['Swain', '2.7500'],
    ['Transylvania', '2.2500'],
    ['Tyrrell', '2.2500'],
    ['Union', '2.2500'],
    ['Vance', '2.2500'],
    ['Wake', '2.5000'],
    ['Warren', '2.2500'],
    ['Washington', '2.2500'],
    ['Watauga', '2.2500'],
    ['Wayne', '2.2500'],
    ['Wilkes', '2.2500'],
    ['Wilson', '2.2500'],
    ['Yadkin', '2.2500'],
    ['Yancey', '2.2500'],
  ];

  // NC state-level default
  rates.push({
    state: 'NC', county: null,
    combinedRate: ncState, stateRate: ncState, countyRate: '0.0000',
    appliesToProducts: true, appliesToServices: false,
  });

  for (const [county, local] of ncCounties) {
    const combined = (parseFloat(ncState) + parseFloat(local)).toFixed(4);
    rates.push({
      state: 'NC', county,
      combinedRate: combined, stateRate: ncState, countyRate: local,
      appliesToProducts: true, appliesToServices: false,
    });
  }

  return rates;
}
