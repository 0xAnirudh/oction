// One shape for every rejected request: a code the client can branch on
// and a list of fields a form can highlight.
export const validate =
  (schema, source = 'body') =>
  (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(422).json({
        error: 'invalid_request',
        fields: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    req.valid = { ...(req.valid ?? {}), [source]: result.data };
    next();
  };
