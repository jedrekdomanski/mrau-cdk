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

    const s3Integration = this.createS3GetIntegration(documentsBucket, executeRole)
    this.addDocumentsGetEndpoint(apiGateway, s3Integration);

    // Enable API log group
    const stage = apiGateway.deploymentStage!.node.defaultChild as apigw.CfnStage;

    // CloudWatch Log Group
    const logGroup = this.createCloudWatchAccessLogGroup(apiGateway)

    this.addApiAccessLogSettings(stage, logGroup)
    logGroup.grantWrite(new ServicePrincipal('apigateway.amazonaws.com'));
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
    const executeRole = new Role(this, "api-gateway-s3-assume-role", {
      assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
      roleName: "API-Gateway-S3-Integration-Role",
    });

    executeRole.addToPolicy(
      new PolicyStatement({
        resources: [bucket.bucketArn],
        actions: ['s3:Get', 's3:Put', 's3:Delete', 's3:DeleteObject', 's3:GetObject', 's3:PutObject', 's3:ListBucket'],
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

  private createS3GetIntegration(documentsBucket: IBucket, executeRole: Role) {
    return new apigw.AwsIntegration({
      service: 's3',
      integrationHttpMethod: 'GET',
      path: '{bucket}',
      options: {
        credentialsRole: executeRole,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Content-Type': 'integration.response.header.Content-Type'
            },
          }
        ],
        requestParameters: {
          'integration.request.path.bucket': 'method.request.path.folder'
        },
      },
    });
  }

  private addDocumentsGetEndpoint(apiGateway: apigw.RestApi, s3GetIntegration: apigw.AwsIntegration) {
    apiGateway
      .root
      .addResource('{folder}')
      .addMethod('GET', s3GetIntegration, {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Content-Type': true
            },
          },
        ],
        requestParameters: {
          'method.request.path.folder': true,
          'method.request.header.Content-Type': true
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
        errorMessage: '$context.error.message',
        errorMessageString: '$context.error.messageString',
        responseLength: '$context.responseLength',
      }),
    };
  }
}
