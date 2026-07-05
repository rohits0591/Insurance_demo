// Simple demo business rules — swap for real underwriting/eligibility
// rules in a production build.

function recommendAddOn(ageBand) {
  const map = {
    '18-30': 'Critical Illness Rider',
    '31-45': 'Personal Accident Cover',
    '46-60': 'Health Top-up Plan',
    '60+': 'Senior Citizen Wellness Rider',
  };
  return map[ageBand] || 'Personal Accident Cover';
}

function daysBetween(dateA, dateB) {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const a = new Date(dateA.toDateString ? dateA.toDateString() : dateA);
  const b = new Date(dateB.toDateString ? dateB.toDateString() : dateB);
  return Math.round((b - a) / MS_PER_DAY);
}

function isWithinNextNDays(targetDateStr, n) {
  const today = new Date();
  const target = new Date(targetDateStr);
  const diff = daysBetween(today, target);
  return diff >= 0 && diff <= n;
}

module.exports = { recommendAddOn, daysBetween, isWithinNextNDays };
