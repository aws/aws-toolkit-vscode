import { transform } from './templateTransformer'
import { DefaultLambdaClient } from '../../../shared/clients/lambdaClient'
import { List } from 'immutable'
import { FunctionConfiguration } from 'aws-sdk/clients/lambda'

export async function generateFunctionTemplate() {
    const funcName = 'test-py'

    const client = new DefaultLambdaClient('us-east-1')
    const functionData = await client.getFunction(funcName)
    // let eventInvokeConfig: any = await client.getEventInvokeConfigs(funcName);
    // if (eventInvokeConfig) {
    //   eventInvokeConfig = eventInvokeConfig[0];
    // }
    const eventInvokeConfig = {
        MaximumEventAgeInSeconds: 21600,
        MaximumRetryAttempts: 2,
    }
    const functionUrlConfig = await client.getFunctionUrlConfigs(funcName)
    console.log(eventInvokeConfig)
    console.log(functionUrlConfig)
    const lambdaConfig: FunctionConfiguration | undefined = functionData.Configuration

    // Do some finessing for buildSamObject's expected format
    const lambda: any = {
        functionName: lambdaConfig?.FunctionName,
        // code properties
        // sourceKMSKeyArn: lambdaConfig?.KMSKeyArn,
        // Basic properties
        description: lambdaConfig?.Description,
        memorySize: lambdaConfig?.MemorySize,
        timeout: lambdaConfig?.Timeout,
        handler: lambdaConfig?.Handler,
        runtime: lambdaConfig?.Runtime,
        // Other properties
        architectures: lambdaConfig?.Architectures,
        codeSigningConfigArn: lambdaConfig?.SigningProfileVersionArn,
        deadLetterQueue: lambdaConfig?.DeadLetterConfig,
        ephemeralStorage: lambdaConfig?.EphemeralStorage?.Size,
        // environmentVariables: ,  // Bogus property
        eventInvokeConfig,
        fileSystemConfigs: lambdaConfig?.FileSystemConfigs,
        // functionUrlConfig,
        imageUri: functionData.Code?.ImageUri,
        kmsKeyArn: lambdaConfig?.KMSKeyArn,
        layers: lambdaConfig?.Layers,
        packageType: lambdaConfig?.PackageType,
        policies: [
            {
                Statement: [
                    {
                        Effect: 'Allow',
                        Action: ['logs:CreateLogGroup'],
                        Resource: 'arn:aws:logs:us-east-1:533267366704:*',
                    },
                    {
                        Effect: 'Allow',
                        Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
                        Resource: [`arn:aws:logs:us-east-1:533267366704:log-group:/aws/lambda/${funcName}:*`],
                    },
                ],
            },
        ],
        // publicAccessBlockConfig: ,
        recursiveLoop: 'Terminate',
        // reservedConcurrentExecutions,
        roleSelectionType: 'existing',
        roleData: {
            existingRole: lambdaConfig?.Role,
            roleType: 'Lambda',
            roleTemplates: {},
            resource: {},
        },
        runtimeManagementConfig: {
            UpdateRuntimeOn: 'Auto',
        },
        snapStart: lambdaConfig?.SnapStart?.ApplyOn,
        tags: functionData.Tags?.userTags,
        tracing: lambdaConfig?.TracingConfig,
        vpcConfig: lambdaConfig?.VpcConfig,
        // "Second pass" properties depending on a structure set up by the properties above
        // 'ipv6AllowedForDualStack',
        // hard code default values b/c api call is not working
        maximumEventAgeInSeconds: eventInvokeConfig.MaximumEventAgeInSeconds, // Sub-property of eventInvokeConfig
        maximumRetryAttempts: eventInvokeConfig.MaximumRetryAttempts, // Sub-property of eventInvokeConfig
    }

    console.log(lambdaConfig)
    console.log(lambda)

    const triggerNodes = List()
    // Now do events (triggers)
    const triggers = triggerNodes
        .map((node: any) => node.get('data'))
        .map((trigger: any) => trigger.set('id', trigger.getIn(['data', 'sourceType'])))
        .toJS()

    const template = transform({ lambda, relations: triggers })
    return template
}
