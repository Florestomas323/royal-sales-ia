/**
 * Intentionally empty.
 *
 * Replaced by components/overview/pipeline-funnels.tsx, which renders TWO
 * independent funnels — sales and recruiting — with the current stages and no
 * exit state inside the funnel. Kept as an empty module so the repository
 * never passes through a state where a stale component is still present but
 * its imports are gone. Nothing imports it.
 */
export {}
