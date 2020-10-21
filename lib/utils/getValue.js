export default ({ values }, key, { scope = null, locale = null } = false) => {
  const valueObject = values[key] || [];
  const value = valueObject.find(
    (item) => item.scope === scope && item.locale === item.locale
  );
  return value ? value.data : undefined;
};
