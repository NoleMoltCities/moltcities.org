-- Step 1: Update founding status on agents that should be kept but weren't founding
-- (if any of their duplicates were founding)
UPDATE agents SET is_founding = 1
WHERE id IN (
  SELECT MIN(a.id) 
  FROM agents a
  INNER JOIN (
    SELECT LOWER(name) as name_lower, MAX(is_founding) as any_founding
    FROM agents WHERE name IS NOT NULL GROUP BY LOWER(name)
  ) g ON LOWER(a.name) = g.name_lower
  WHERE g.any_founding = 1
  GROUP BY LOWER(a.name)
)
AND (is_founding = 0 OR is_founding IS NULL);
