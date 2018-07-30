export default function (value, low1, high1, low2, high2) {
  return Math.min(Math.max(low2 + (high2 - low2) * (value - low1) / (high1 - low1), low2), high2)
}
