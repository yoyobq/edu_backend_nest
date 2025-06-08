import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CatsModule } from './cats/cats.module';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.graphql'),
      introspection: true, // 可选：启用内省
      playground: false,
      plugins: [ApolloServerPluginLandingPageLocalDefault()], // ✅ 启用 Apollo Sandbox
      sortSchema: true, // 排序 schema.graphql 中的字段以便 diff
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
