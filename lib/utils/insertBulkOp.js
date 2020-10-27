export default (op, fn, options) => async (data, moreOptions) => {
  const result = await fn(data, { ...options, ...moreOptions });
  if (!result) return;
  return op.insert(result);
};
