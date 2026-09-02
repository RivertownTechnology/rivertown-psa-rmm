/**
 * South Carolina and North Carolina county sales tax rates.
 *
 * SOURCES — refreshed 2026-09-02. Re-verify before relying on these for a filing;
 * counties change local rates on May 1 (SC) and quarterly (NC).
 *   SC: SCDOR form ST-500 "Local Tax Designation by County", Rev. 3/9/2026,
 *       effective May 1, 2026. State rate 6%.
 *       https://dor.sc.gov/sites/dor/files/forms/ST500.pdf
 *   NC: NCDOR "Current Sales and Use Tax Rates". State rate 4.75%.
 *       https://www.ncdor.gov/taxes-forms/sales-and-use-tax/sales-and-use-tax-rates/current-sales-and-use-tax-rates
 *
 * KNOWN LIMITATION — municipal rates are not representable here. This table is
 * keyed on state + county only, but some municipalities differ from their
 * county. The one that matters locally: the City of Myrtle Beach is 9% while
 * the rest of Horry County is 8%. A Myrtle Beach customer will be under-taxed
 * by 1% until municipal rates are modeled. Same applies to the Catawba Indian
 * Reservation, and to any local taxes counties collect directly rather than
 * through SCDOR.
 *
 * Rates below are stored as the LOCAL portion; combinedRate = state + local.
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

/** SC state sales tax rate (percent). */
const SC_STATE_RATE = 6.0000;
/** NC state sales tax rate (percent). */
const NC_STATE_RATE = 4.7500;

// [county, local rate] — combined is computed, so a county rate change is a
// one-number edit and the combined total can't drift out of sync with it.
const SC_COUNTIES: [string, string][] = [
    ['Abbeville', '1.0000'],
    ['Aiken', '2.0000'],
    ['Allendale', '2.0000'],
    ['Anderson', '1.0000'],
    ['Bamberg', '2.0000'],
    ['Barnwell', '2.0000'],
    ['Beaufort', '0.0000'],
    ['Berkeley', '3.0000'],
    ['Calhoun', '2.0000'],
    ['Charleston', '3.0000'],
    ['Cherokee', '2.0000'],
    ['Chester', '2.0000'],
    ['Chesterfield', '2.0000'],
    ['Clarendon', '1.0000'],
    ['Colleton', '2.0000'],
    ['Darlington', '2.0000'],
    ['Dillon', '2.0000'],
    ['Dorchester', '1.0000'],
    ['Edgefield', '2.0000'],
    ['Fairfield', '1.0000'],
    ['Florence', '2.0000'],
    ['Georgetown', '1.0000'],
    ['Greenville', '0.0000'],
    ['Greenwood', '1.0000'],
    ['Hampton', '1.0000'],
    ['Horry', '2.0000'],
    ['Jasper', '3.0000'],
    ['Kershaw', '2.0000'],
    ['Lancaster', '2.0000'],
    ['Laurens', '2.0000'],
    ['Lee', '2.0000'],
    ['Lexington', '1.0000'],
    ['McCormick', '2.0000'],
    ['Marion', '2.0000'],
    ['Marlboro', '2.0000'],
    ['Newberry', '1.0000'],
    ['Oconee', '0.0000'],
    ['Orangeburg', '1.0000'],
    ['Pickens', '1.0000'],
    ['Richland', '2.0000'],
    ['Saluda', '2.0000'],
    ['Spartanburg', '1.0000'],
    ['Sumter', '2.0000'],
    ['Union', '1.0000'],
    ['Williamsburg', '2.0000'],
    ['York', '1.0000'],
];

const NC_COUNTIES: [string, string][] = [
    ['Alamance', '2.0000'],
    ['Alexander', '2.2500'],
    ['Alleghany', '2.2500'],
    ['Anson', '2.2500'],
    ['Ashe', '2.2500'],
    ['Avery', '2.0000'],
    ['Beaufort', '2.0000'],
    ['Bertie', '2.2500'],
    ['Bladen', '2.0000'],
    ['Brunswick', '2.0000'],
    ['Buncombe', '2.2500'],
    ['Burke', '2.0000'],
    ['Cabarrus', '2.2500'],
    ['Caldwell', '2.0000'],
    ['Camden', '2.0000'],
    ['Carteret', '2.0000'],
    ['Caswell', '2.0000'],
    ['Catawba', '2.2500'],
    ['Chatham', '2.2500'],
    ['Cherokee', '2.2500'],
    ['Chowan', '2.0000'],
    ['Clay', '2.2500'],
    ['Cleveland', '2.0000'],
    ['Columbus', '2.0000'],
    ['Craven', '2.0000'],
    ['Cumberland', '2.2500'],
    ['Currituck', '2.0000'],
    ['Dare', '2.0000'],
    ['Davidson', '2.2500'],
    ['Davie', '2.0000'],
    ['Duplin', '2.2500'],
    ['Durham', '2.7500'],
    ['Edgecombe', '2.2500'],
    ['Forsyth', '2.2500'],
    ['Franklin', '2.0000'],
    ['Gaston', '2.2500'],
    ['Gates', '2.0000'],
    ['Graham', '2.2500'],
    ['Granville', '2.0000'],
    ['Greene', '2.2500'],
    ['Guilford', '2.0000'],
    ['Halifax', '2.2500'],
    ['Harnett', '2.2500'],
    ['Haywood', '2.2500'],
    ['Henderson', '2.0000'],
    ['Hertford', '2.2500'],
    ['Hoke', '2.0000'],
    ['Hyde', '2.0000'],
    ['Iredell', '2.0000'],
    ['Jackson', '2.2500'],
    ['Johnston', '2.0000'],
    ['Jones', '2.2500'],
    ['Lee', '2.2500'],
    ['Lenoir', '2.0000'],
    ['Lincoln', '2.2500'],
    ['Macon', '2.0000'],
    ['Madison', '2.2500'],
    ['Martin', '2.2500'],
    ['McDowell', '2.0000'],
    ['Mecklenburg', '3.5000'],
    ['Mitchell', '2.0000'],
    ['Montgomery', '2.2500'],
    ['Moore', '2.2500'],
    ['Nash', '2.0000'],
    ['New Hanover', '2.2500'],
    ['Northampton', '2.0000'],
    ['Onslow', '2.2500'],
    ['Orange', '2.7500'],
    ['Pamlico', '2.0000'],
    ['Pasquotank', '2.2500'],
    ['Pender', '2.0000'],
    ['Perquimans', '2.0000'],
    ['Person', '2.0000'],
    ['Pitt', '2.2500'],
    ['Polk', '2.0000'],
    ['Randolph', '2.2500'],
    ['Richmond', '2.0000'],
    ['Robeson', '2.2500'],
    ['Rockingham', '2.2500'],
    ['Rowan', '2.2500'],
    ['Rutherford', '2.2500'],
    ['Sampson', '2.2500'],
    ['Scotland', '2.0000'],
    ['Stanly', '2.2500'],
    ['Stokes', '2.0000'],
    ['Surry', '2.2500'],
    ['Swain', '2.2500'],
    ['Transylvania', '2.0000'],
    ['Tyrrell', '2.0000'],
    ['Union', '2.0000'],
    ['Vance', '2.0000'],
    ['Wake', '2.5000'],
    ['Warren', '2.0000'],
    ['Washington', '2.2500'],
    ['Watauga', '2.0000'],
    ['Wayne', '2.0000'],
    ['Wilkes', '2.2500'],
    ['Wilson', '2.0000'],
    ['Yadkin', '2.0000'],
    ['Yancey', '2.0000'],
];

function build(
  state: string, stateRate: number, counties: [string, string][],
): TaxSeedRate[] {
  const rates: TaxSeedRate[] = counties.map(([county, local]) => ({
    state,
    county,
    combinedRate: (stateRate + parseFloat(local)).toFixed(4),
    stateRate: stateRate.toFixed(4),
    countyRate: local,
    // Both states tax tangible personal property; most services are exempt.
    // Override per-row in Settings for anything you treat differently.
    appliesToProducts: true,
    appliesToServices: false,
  }));

  // State-level default row (county = null) — the fallback when a customer's
  // county can't be resolved. Bare state rate, no local portion assumed.
  rates.push({
    state,
    county: null,
    combinedRate: stateRate.toFixed(4),
    stateRate: stateRate.toFixed(4),
    countyRate: '0.0000',
    appliesToProducts: true,
    appliesToServices: false,
  });

  return rates;
}

export function getSCNCTaxRates(): TaxSeedRate[] {
  return [
    ...build('SC', SC_STATE_RATE, SC_COUNTIES),
    ...build('NC', NC_STATE_RATE, NC_COUNTIES),
  ];
}
