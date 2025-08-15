// src/core/config/graphql.config.ts

const graphqlConfig = () => ({
  graphql: {
    schemaDestination: 'src/schema.graphql',
    introspection: true,
    playground: false,
    sortSchema: true,
    subscriptions: {
      // graphql-ws 是 Apollo 要求的关键字，不能改名
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'graphql-ws': true,
    },
  },
});

export default graphqlConfig;
