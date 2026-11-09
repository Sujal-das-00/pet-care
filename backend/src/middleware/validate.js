/**
 * validate({ body, query, params }) parses with zod schemas and exposes the parsed values on
 * req.valid.{body,query,params}. (Express 5 makes req.query read-only, so we don't overwrite it.)
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid = req.valid || {};
  for (const part of ['params', 'query', 'body']) {
    if (schemas[part]) req.valid[part] = schemas[part].parse(req[part] ?? {});
  }
  next();
};
