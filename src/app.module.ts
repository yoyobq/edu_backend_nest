import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CatsModule } from './cats/cats.module';

@Module({
  imports: [
    // GraphQLModule 类型有延迟推断，实际使用安全，在 strict 模式下压制 ESLint

    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      graphiql: true,
      introspection: true, // 可选：启用内省
      subscriptions: {
        // graphql-ws 是 Apollo 要求的关键字，不能改名
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'graphql-ws': true, // 开启 graphql-ws 支持
      },
    }),
    CatsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
