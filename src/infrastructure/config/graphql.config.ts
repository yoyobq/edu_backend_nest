// src/infrastructure/config/graphql.config.ts

const graphqlConfig = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const sandboxEnabled =
    process.env.GRAPHQL_SANDBOX_ENABLED !== undefined
      ? process.env.GRAPHQL_SANDBOX_ENABLED === 'true'
      : !isProduction;

  return {
    graphql: {
      schemaDestination: 'src/schema.graphql',
      introspection: true,
      playground: sandboxEnabled,
      sortSchema: true,
      subscriptions: {
        // graphql-ws 是 Apollo 要求的关键字，不能改名
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'graphql-ws': true,
      },
    },
  };
};

export default graphqlConfig;
