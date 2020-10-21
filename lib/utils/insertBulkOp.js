export default (op, fn, options) => async (data, moreOptions) => {
  const result = await fn(data, { ...options, ...moreOptions });
  return op.insert(result);
};
