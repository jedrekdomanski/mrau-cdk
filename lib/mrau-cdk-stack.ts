import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket, IBucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import { LogGroup, ILogGroup } from 'aws-cdk-lib/aws-logs';
import { BucketDeployment, Source }from 'aws-cdk-lib/aws-s3-deployment';
import {
  ManagedPolicy,
  Policy,
  Role,
  PolicyStatement,
  ServicePrincipal
} from 'aws-cdk-lib/aws-iam';

export class MrauCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Bucket for documents
    const documentsBucket = this.createBucketForDocuments();

    // API Gateway
    const apiGateway = this.createAPIGateway();

    // CloudWatch role for API Gateway
    const executeRole = this.createExecutionRole(documentsBucket);
    documentsBucket.grantReadWrite(executeRole);

    // CloudWatch Role to read API Gateway logs
    const cloudWatchRole = this.createCloudWatchRole()
    const policy = this.createCloudWatchManagedPolicy()
    cloudWatchRole.addManagedPolicy(policy);

    const s3Integration = this.createS3Integration(documentsBucket, executeRole)
    this.addDocumentsEndpoint(apiGateway, s3Integration);

    // Enable API log group
    const stage = apiGateway.deploymentStage!.node.defaultChild as apigw.CfnStage;

    // CloudWatch Log Group
    const logGroup = this.createCloudWatchAccessLogGroup(apiGateway)

    this.addApiAccessLogSettings(stage, logGroup)
    logGroup.grantWrite(new ServicePrincipal('apigateway.amazonaws.com'));

    // #### Pets lambdas ####
    // PetCreateHandler POST lambda
    // const PetCreateHandler = new lambda.Function(this, 'PetCreateHandler', {
    //   runtime: lambda.Runtime.RUBY_2_7,
    //   handler: 'index.handler',
    //   memorySize: 1024,
    //   code: lambda.Code.fromAsset('lib/lambdas/pets/create/'),
    //   timeout: cdk.Duration.seconds(3)
    // });

    // // PetUpdateHandler PATCH lambda
    // const PetUpdateHandler = new lambda.Function(this, 'PetUpdateHandler', {
    //   runtime: lambda.Runtime.RUBY_2_7,
    //   handler: 'index.handler',
    //   memorySize: 1024,
    //   code: lambda.Code.fromAsset('lib/lambdas/pets/update/'),
    //   timeout: cdk.Duration.seconds(3)
    // });

    // // PetDeleteHandler DELETE lambda
    // const PetDeleteHandler = new lambda.Function(this, 'PetDeleteHandler', {
    //   runtime: lambda.Runtime.RUBY_2_7,
    //   handler: 'index.handler',
    //   memorySize: 1024,
    //   code: lambda.Code.fromAsset('lib/lambdas/pets/delete/'),
    //   timeout: cdk.Duration.seconds(3)
    // });

    // // PetDeleteHandler GET lambda
    // const PetGetHandler = new lambda.Function(this, 'PetGetHandler', {
    //   runtime: lambda.Runtime.RUBY_2_7,
    //   handler: 'index.handler',
    //   memorySize: 1024,
    //   code: lambda.Code.fromAsset('lib/lambdas/pets/get/'),
    //   timeout: cdk.Duration.seconds(3)
    // });
    // #### News lambdas ####
    // TODO
  }

  private createBucketForDocuments() {
    return new Bucket(this, 'MrauDokumenty', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      bucketName: "mrau-dokumenty",
    });
  }

  private createAPIGateway() {
    return new apigw.RestApi(this, 'MrauAPIGateway', {
      cloudWatchRole: true,
      endpointConfiguration: {
        types: [apigw.EndpointType.REGIONAL]
      },
      restApiName: 'MrauAPI',
      description: 'Serves static assets from S3',
      binaryMediaTypes: ['*/*'],
      minimumCompressionSize: 0,
    });
  }

  private createExecutionRole(bucket: IBucket) {
    const executeRole = new Role(this, "api-gateway-s3-assume-tole", {
      assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
      roleName: "API-Gateway-S3-Integration-Role",
    });

    executeRole.addToPolicy(
      new PolicyStatement({
        resources: [bucket.bucketArn],
        actions: ["s3:Get", 's3:Put', 's3:Delete'],
      })
    );

    return executeRole;
  }

  private createCloudWatchRole() {
    return new Role(this, 'MrauCloudWatchRole', {
      assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
      description: 'Grant write access to CloudWatch',
    });
  }

  private createCloudWatchManagedPolicy() {
    return ManagedPolicy.fromManagedPolicyArn(
      this,
      'CloudWatchManagedPolicy',
      'arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs'
    );
  }

  private createS3Integration(documentsBucket: IBucket, executeRole: Role) {
    return new apigw.AwsIntegration({
      service: 's3',
      integrationHttpMethod: 'GET',
      path: `${documentsBucket.bucketName}/{folder}/{key}`,
      options: {
        credentialsRole: executeRole,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Content-Type': 'integration.response.header.Content-Type',
            },
          },
        ],
        requestParameters: {
          'integration.request.path.folder': 'method.request.path.folder',
          'integration.request.path.key': 'method.request.path.key',
        },
      },
    });
  }

  private addDocumentsEndpoint(apiGateway: apigw.RestApi, s3Integration: apigw.AwsIntegration) {
    apiGateway.root
      .addResource('assets')
      .addResource("{folder}")
      .addResource("{key}")
      .addMethod('GET', s3Integration, {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Content-Type': true,
            },
          },
        ],
        requestParameters: {
          'method.request.path.folder': true,
          'method.request.path.key': true,
          'method.request.header.Content-Type': true,
        },
      });
  }

  private createCloudWatchAccessLogGroup(apiGateway: apigw.RestApi) {
    return new LogGroup(apiGateway, 'MrauAccessLogs', {
      retention: 30
    });
  }

  private addApiAccessLogSettings(stage: apigw.CfnStage, logGroup: ILogGroup) {
    stage.accessLogSetting = {
      destinationArn: logGroup.logGroupArn,
      format: JSON.stringify({
        requestId: '$context.requestId',
        userAgent: '$context.identity.userAgent',
        sourceIp: '$context.identity.sourceIp',
        requestTime: '$context.requestTime',
        httpMethod: '$context.httpMethod',
        path: '$context.path',
        status: '$context.status',
        responseLength: '$context.responseLength',
      }),
    };
  }
}
