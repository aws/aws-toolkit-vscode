import { Collection, List, Map } from 'immutable'
import yaml from 'js-yaml'

const DEFAULT_EXPORT = () => ({
    messages: [{ level: 'WARN', message: 'export.triggerNotSupported' }],
    eventResources: [],
})
// /**
//  * Types built from these constructors should not be
//  * transformed to a plain object. We compare by name
//  * rather than reference to account for ponyfills
//  * (i.e lib1 uses poly@2.x but lib2 uses poly@3.x).
//  */
// const CONSTRUCTORS_TO_IGNORE: Set<string> = Set([
//   ArrayBuffer.name,
//   Date.name,
//   Uint8Array.name,
//   'Uint8ArrayBlobAdapter',
//   'Buffer', // don't assume availability, but respect implementations
// ]);
// /**
//  * Determines if an object is "plain enough". That is,
//  * it can be and should be transformed to a plain object.
//  */
// const isPlainObjectLike = (o: any) => (
//   o !== null
//   && typeof o === 'object'
//   && !CONSTRUCTORS_TO_IGNORE.has(o?.constructor?.name)
// );
// type Transformer = (item: any, parentKey?: any) => any;
// const deepTransform = (
//   obj: any,
//   keyTransformer: Transformer = (_: any) => _,
//   valueTransformer: Transformer = (_: any) => _,
// ): any => {
//   const transform = (o: any, parentKey?: any): any => {
//     if (Array.isArray(o)) {
//       return o.map((e: any) => transform(e));
//     }
//     if (isPlainObjectLike(o)) {
//       return Object.entries(o).reduce((res, [k, v]) => ({
//         ...res,
//         [keyTransformer(k, parentKey)]: transform(v, k),
//       }), {});
//     }
//     return valueTransformer(o, parentKey);
//   };
//   return transform(obj);
// };

/**
 * Helper function to generate a !GetAtt string
 *
 * prop - the name of the property to get
 * suffix - if anything should be appended to the end
 * of the property name, like an index
 * att - the attribute to get
 *
 * returns a string like !GetAtt <prop><suffix>.<att>
 * Example: !GetAtt DocumentDBPassword1.Value
 */
export const getAtt = (prop: string, suffix: string, att: string) => `!GetAtt ${prop}${suffix}.${att}`

interface Resource {
    key: string
    type: string
    comment?: string // comments are shown in the SAM template above the resource's logical ID
    properties?: Record<string, any>
}

/* Relations */

// messages are shown in the "download" modal as an alert.
interface Message {
    level: string
    message: string
}
interface EventResource extends Resource {
    messages?: Message[]
    reference?: EventResource[]
}
interface TransformResult {
    messages: Message[]
    eventResources: EventResource[]
}

/**
 * Each transformer has format [id]: <transformFunction>
 * The id for a given trigger can be found in that trigger's node package's
 * vertex.json file. See LambdaConsoleVertexNodes package for more.
 *
 * Note that not all transformers will need references. Some SAM resources are
 * generated resources, which means when the SAM template is built it will
 * automatically build the associated CloudFormation resources.
 *
 * Conversely, some resources are generated resources but will still need references defined.
 * All streaming events (such as DynamoDB) follow this pattern. This is because the generated
 * resource for these events is only the AWS::Lambda::EventSourceMapping resouce.
 *
 * #NOTE: When using comments make sure to break up your string into short lines
 * and add a "#" character to the start of each line. Example:
 *
 * comment: `# This resource represents your Layer with name ` +
    `# ${layerArn}. ` +
    `# To download the content of your Layer, ` +
    `# go to ${getBaseAwsDomain()}/${getResourceUrl(layerArn)}`,
 *
 * #TODO: Figure out a secure way to add DocumentDB. See https://t.corp.amazon.com/V1054970380
 */
const TRANSFORMERS: Record<string, (index: number | string, data: Record<string, any>) => TransformResult> = {
    // robots in disguise
    'amazon/alexa': (index) => ({
        messages: [],
        eventResources: [
            {
                key: `AlexaSkillEvent${index}`,
                type: 'AlexaSkill',
                reference: [
                    {
                        key: `AlexaSkillEvent${index}`,
                        type: 'Alexa::ASK::Skill',
                        properties: {
                            AuthenticationConfiguration: {
                                ClientId: 'Fill in',
                                ClientSecret: 'Fill in',
                                RefreshToken: 'Fill in',
                            },
                            SkillPackage: 'Fill in',
                            VendorId: 'Fill in',
                        },
                    },
                ],
                messages: [{ level: 'INFO', message: 'export.alexa_skills_kit.toConfigure' }],
            },
        ],
    }),
    // Apache/Kafka trigger does not have an associated AWS resource
    'apache/kafka': (index, data) => ({
        messages: [],
        eventResources: [
            {
                key: `ApacheKafka${index}`,
                type: 'SelfManagedKafka',
                properties: {
                    SourceAccessConfigurations: [{ Type: data.authentication, URI: data.sourceAccessSecretUri }],
                    Topics: ['Fill in'],
                    KafkaBootstrapServers: data.kafkaBootstrapServers.map((s: any) => s.key),
                },
            },
        ],
    }),
    'aws/apigateway': (index, data) => ({
        // generated resource
        messages: [],
        eventResources: [
            {
                key: `Api${index}`,
                type: 'Api',
                properties: {
                    // #NOTE Path MUST start with /
                    Path: data.path?.name || '/MyResource',
                    Method: data.method || 'ANY',
                },
                messages: [],
            },
        ],
    }),
    'aws/cloudwatchlogs': (index, data) => ({
        messages: [],
        eventResources: [
            {
                key: `CloudWatchLogs${index}`,
                type: 'CloudWatchLogs',
                properties: {
                    FilterPattern: data.filterPattern || '',
                    LogGroupName: `LogGroup${index}`,
                },
                reference: [
                    {
                        key: `CloudWatchLogs${index}`,
                        type: 'AWS::Logs::LogGroup',
                        properties: {
                            LogGroupName: `LogGroup${index}`,
                        },
                    },
                ],
            },
        ],
    }),
    'aws/cognito': (index, data) => ({
        messages: [],
        eventResources: [
            {
                key: `Cognito${index}`,
                type: 'Cognito',
                reference: [
                    {
                        key: `UserPool${index}`,
                        type: 'AWS::Cognito::UserPool',
                        properties: {
                            AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
                            UserPoolName: data.poolName || `Pool${index}`,
                        },
                    },
                    {
                        key: `UserPoolClient${index}`,
                        type: 'AWS::Cognito::UserPoolClient',
                        properties: {
                            ClientName: `UserPoolClient${index}`,
                            UserPoolId: getAtt('UserPool', index.toString(10), 'ProviderName'),
                        },
                    },
                ],
                properties: {
                    Trigger: ['Fill in'], // placeholder
                    UserPool: {
                        Ref: `UserPool${index}`,
                    },
                },
            },
        ],
    }),
    'aws/iot': (index, data) => {
        // generated resource
        let Sql: string
        const messages = []
        if (data.sql) {
            Sql = data.sql
        } else {
            Sql = 'TODO fill in your SQL, e.g. SELECT * FROM "topic/test"'
            messages.push({ level: 'INFO', message: 'export.iot.noSql' })
        }
        return {
            messages: [],
            eventResources: [
                {
                    key: `IoTRule${index}`,
                    type: 'IoTRule',
                    properties: {
                        Sql,
                    },
                    messages,
                },
            ],
        }
    },
    'aws/eventbridge': (index, data) => {
        // generated resource
        const ret: TransformResult = {
            messages: [],
            eventResources: [],
        }
        if (data.scheduleExpression) {
            ret.eventResources.push({
                key: `Schedule${index}`,
                type: 'Schedule',
                properties: {
                    Schedule: data.scheduleExpression,
                },
                messages: [],
            })
        }
        if (data.eventPattern) {
            ret.eventResources.push({
                key: `EventBridgeRule${index}`,
                type: 'EventBridgeRule',
                properties: {
                    Pattern: data.eventPattern,
                },
                messages: [],
            })
        }
        return ret
    },
    'aws/dynamodb': (index, data) => ({
        // streaming generated resource
        messages: [],
        eventResources: [
            {
                key: `DynamoDB${index}`,
                type: 'DynamoDB',
                reference: [
                    {
                        key: `Table${index}`,
                        type: 'AWS::DynamoDB::Table',
                        properties: {
                            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
                            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
                            ProvisionedThroughput: {
                                ReadCapacityUnits: 5,
                                WriteCapacityUnits: 5,
                            },
                            StreamSpecification: {
                                StreamViewType: 'NEW_IMAGE',
                            },
                        },
                        messages: [],
                    },
                ],
                properties: {
                    Stream: {
                        'Fn::GetAtt': [`Table${index}`, 'StreamArn'],
                    },
                    StartingPosition: data.startingPosition || 'TRIM_HORIZON',
                    BatchSize: data.batchSize || 100,
                },
                messages: [],
            },
        ],
    }),
    'aws/kinesis': (index, data) => ({
        // streaming generated resource
        messages: [],
        eventResources: [
            {
                key: `Kinesis${index}`,
                type: 'Kinesis',
                reference: [
                    {
                        key: `KinesisStream${index}`,
                        type: 'AWS::Kinesis::Stream',
                        properties: {
                            Name: `KinesisStream${index}`,
                            StreamEncryption: {
                                EncryptionType: 'KMS',
                                KeyId: {
                                    'Fn::GetAtt': [`KMSKeyForKinesisStream${index}`, 'Arn'],
                                },
                            },
                        },
                        messages: [],
                    },
                    {
                        key: `KMSKeyForKinesisStream${index}`,
                        type: 'AWS::KMS::Key',
                    },
                ],
                properties: {
                    Stream: {
                        'Fn::GetAtt': [`KinesisStream${index}`, 'Arn'],
                    },
                    StartingPosition: data.startingPosition || 'TRIM_HORIZON',
                    BatchSize: data.batchSize || 100,
                },
                messages: [],
            },
        ],
    }),
    'aws/mq': (index, data) => {
        const transformed: any = {
            messages: [],
            eventResources: [
                {
                    key: `MQ${index}`,
                    type: 'MQ',
                    reference: [
                        {
                            key: `MQBrokerUserPassword${index}`,
                            type: 'AWS::SSM::Parameter',
                            properties: {
                                Name: `MQBrokerUserPassword${index}`,
                                Value: 'Fillin',
                                Type: 'String',
                            },
                        },
                        {
                            key: `MQBroker${index}`,
                            type: 'AWS::AmazonMQ::Broker',
                            properties: {
                                AutoMinorVersionUpgrade: true, // placeholder
                                BrokerName: `MQBroker${index}`,
                                DeploymentMode: 'SINGLE_INSTANCE', // placeholder
                                EngineType: 'ACTIVEMQ', // placeholder
                                EngineVersion: '5.15.0', // placeholder
                                HostInstanceType: 'mq.t2.micro', // placeholder
                                PubliclyAccessible: false, // placeholder
                                Users: [
                                    {
                                        Username: 'Fillin',
                                        Password: { 'Fn::GetAtt': [`MQBrokerUserPassword${index}`, 'Value'] },
                                    },
                                ], // placeholder
                            },
                        },
                    ],
                    properties: {
                        BatchSize: data.batchSize,
                        Broker: {
                            Ref: `MQBroker${index}`,
                        },
                        SourceAccessConfigurations: [{ Type: data.authentication, URI: data.sourceAccessSecretUri }],
                        Queues: [data.queues],
                    },
                },
            ],
        }

        if (data.filterCriteria) {
            transformed.eventResources[0].properties.FilterCriteria = {
                Filters: data.filterCriteria.map((filter: any) => ({ Pattern: filter.key })),
            }
        }

        if (data.maximumBatchingWindowInSeconds) {
            transformed.eventResources[0].properties.MaximumBatchingWindowInSeconds =
                data.maximumBatchingWindowInSeconds
        }

        if (data.sourceAccessVirtualHost) {
            transformed.eventResources[0].properties.SourceAccessConfigurations.push({
                Type: 'VIRTUAL_HOST',
                URI: data.sourceAccessVirtualHost,
            })
        }

        return transformed
    },
    'aws/msk': (index, data) => {
        const transformed: any = {
            messages: [],
            eventResources: [
                {
                    key: `MSK${index}`,
                    type: 'MSK',
                    reference: [
                        {
                            key: `MSKCluster${index}`,
                            type: 'AWS::MSK::Cluster',
                            properties: {
                                BrokerNodeGroupInfo: {
                                    ClientSubnets: ['Fill in'], // placeholder
                                    InstanceType: 'kafka.t3.small', // placeholder
                                },
                                // following properties all use placeholder values
                                ClusterName: `MSKCluster${index}`,
                                KafkaVersion: '2.2.1',
                                NumberOfBrokerNodes: 1,
                            },
                        },
                    ],
                    properties: {
                        ConsumerGroupId: data.mskConsumerGroupId,
                        SourceAccessConfigurations: [{ Type: data.authentication, URI: data.sourceAccessSecretUri }],
                        StartingPosition: data.startingPosition || 'LATEST', // default,
                        StartingPositionTimestamp: data.startingPositionTimestamp || 0,
                        Stream: {
                            Ref: `MSKCluster${index}`,
                        },
                        Topics: [data.topics],
                    },
                },
            ],
        }

        if (data.filterCriteria) {
            transformed.eventResources[0].properties.FilterCriteria = {
                Filters: data.filterCriteria.map((filter: any) => ({ Pattern: filter.key })),
            }
        }

        if (data.maximumBatchingWindowInSeconds) {
            transformed.eventResources[0].properties.MaximumBatchingWindowInSeconds =
                data.maximumBatchingWindowInSeconds
        }

        return transformed
    },
    'aws/s3': (index, data) => {
        const properties: any = {
            Bucket: {
                Ref: `Bucket${index}`,
            },
        }
        if (data.eventType) {
            const eventType = Array.isArray(data.eventType) ? data.eventType : [data.eventType]
            properties.Events = eventType.map(
                (event: any) =>
                    (
                        ({
                            ObjectCreated: 's3:ObjectCreated:*',
                            ObjectCreatedByCompleteMultipartUpload: 's3:ObjectCreated:CompleteMultipartUpload',
                            ObjectCreatedByCopy: 's3:ObjectCreated:Copy',
                            ObjectCreatedByPost: 's3:ObjectCreated:Post',
                            ObjectCreatedByPut: 's3:ObjectCreated:Put',
                            ObjectRemoved: 's3:ObjectRemoved:*',
                            ObjectRemovedDelete: 's3:ObjectRemoved:Delete',
                            ObjectRemovedDeleteMarkerCreated: 's3:ObjectRemoved:DeleteMarkerCreated',
                            ReducedRedundancyLostObject: 's3:ReducedRedundancyLostObject',
                        }) as Record<string, string>
                    )[event]
            )
        } else {
            properties.Events = ['s3:ObjectCreated:*']
        }
        const filters = []
        if (data.prefix) {
            filters.push({ Name: 'prefix', Value: data.prefix })
        }
        if (data.suffix) {
            filters.push({ Name: 'suffix', Value: data.suffix })
        }
        if (filters.length) {
            properties.Filter = { S3Key: { Rules: filters } }
        }
        return {
            messages: [],
            eventResources: [
                {
                    key: `BucketEvent${index}`,
                    type: 'S3',
                    reference: [
                        {
                            key: `Bucket${index}`,
                            type: 'AWS::S3::Bucket',
                            properties: {
                                // For security, all S3 buckets should use versioning
                                // See https://w.amazon.com/bin/view/AWS_IT_Security/Security_Automation_Integrators/ACAT/Rules/FAQs/S3bucketwithoutversioning
                                VersioningConfiguration: {
                                    Status: 'Enabled',
                                },
                                // For security, all S3 buckets should use encryption
                                // See https://w.amazon.com/bin/view/AWS_IT_Security/Security_Automation_Integrators/ACAT/Rules/FAQs/S3bucketwithoutencryption
                                BucketEncryption: {
                                    ServerSideEncryptionConfiguration: [
                                        { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
                                    ],
                                },
                            },
                            messages: [],
                        },
                        {
                            // [BSC17]: Configure S3 bucket policy to allow only TLS requests
                            key: `BucketPolicy${index}`,
                            type: 'AWS::S3::BucketPolicy',
                            properties: {
                                Bucket: `Bucket${index}`,
                                PolicyDocument: {
                                    Statement: [
                                        {
                                            Action: 's3:*',
                                            Effect: 'Deny',
                                            Principal: '*',
                                            Resource: [`arn:aws:s3:::Bucket${index}/*`, `arn:aws:s3:::Bucket${index}`],
                                            Condition: { Bool: { 'aws:SecureTransport': false } },
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                    properties,
                    messages: [],
                },
            ],
        }
    },
    'aws/sns': (index) => ({
        messages: [],
        eventResources: [
            {
                key: `SNS${index}`,
                type: 'SNS',
                reference: [
                    {
                        key: `SNSTopic${index}`,
                        type: 'AWS::SNS::Topic',
                        properties: {
                            TopicName: `SNSTopic${index}`,
                            KmsMasterKeyId: { Ref: `KMSKeyForSNS${index}` },
                        },
                        messages: [],
                    },
                    {
                        key: `KMSKeyForSNS${index}`,
                        type: 'AWS::KMS::Key',
                    },
                ],
                properties: {
                    Topic: { Ref: `SNSTopic${index}` },
                },
                messages: [],
            },
        ],
    }),
    'aws/sqs': (index, data) => ({
        // streaming generated resource
        messages: [],
        eventResources: [
            {
                key: `SQS${index}`,
                type: 'SQS',
                reference: [
                    {
                        key: `SQSQueue${index}`,
                        type: 'AWS::SQS::Queue',
                        properties: {
                            QueueName: `SQSQueue${index}`,
                            // For security, all SQS queues need encryption
                            // See https://w.amazon.com/bin/view/AWS_IT_Security/Security_Automation_Integrators/ACAT/Rules/FAQs/SQSqueuewithoutencryption
                            SqsManagedSseEnabled: true,
                        },
                        messages: [],
                    },
                ],
                properties: {
                    Queue: { 'Fn::GetAtt': [`SQSQueue${index}`, 'Arn'] },
                    BatchSize: data?.batchSize || 1,
                },
                messages: [],
            },
        ],
    }),
}

// // DESTINATION TRANSFORMERS

// // the type comes from the substring in the Destination arn that can be used to identify the service
// type Destination = 'events' | 'lambda' | 'sqs' | 'sns';

// const getTriggerReference = (trigger: string, suffix: string): EventResource[] => TRANSFORMERS[trigger](suffix, {}).eventResources[0].reference!;

// // Append a "type" which is either "Success" or "Failure" and an index to avoid key collisions with triggers
// // and key collitions with destinations
// const DESTINATION_TRANSFORMERS: Record<Destination, (type: string, index: number) => EventResource[]> = {
//   events: (type: string, index: number) => ([{
//     key: `EventBusDestination${type}${index}`,
//     type: 'AWS::Events::EventBus',
//   }]),
//   lambda: (type: string, index: number) => ([{
//     key: `LambdaDestination${type}${index}`,
//     type: 'AWS::Serverless::Function',
//     properties: {
//       InlineCode: 'console.log("Hello world!")',
//       Runtime: 'nodejs20x',
//       Handler: 'index.js',
//       PackageType: 'zip',
//       FunctionName: `LambdaDestination${type}${index}`,
//       Policies: {
//         LambdaInvokePolicy: {
//           FunctionName: `LambdaDestination${type}${index}`,
//         },
//       },
//     },
//   }]),
//   sqs: (type: string, index: number) => getTriggerReference('aws/sqs', `Destination${type}${index}`),
//   sns: (type: string, index: number) => getTriggerReference('aws/sns', `Destination${type}${index}`),
// };

// // LAYERS
// // This transformer is only used for customer managed Layers (excludes AWS vended layers and cross account layers)
// type LayerData = {
//   arn: string;
//   runtimes?: string[];
//   crossAccount: boolean;
// };

// const LAYER_TRANSFORMER = (index: number, data: LayerData): EventResource => ({
//   key: `Layer${index}`,
//   type: 'AWS::Serverless::LayerVersion',
//   // TODO: replace with offical string when available https://issues.amazon.com/issues/76ddfad9-04bc-411c-bcc0-4d1b5d3b9aaa
//   comment: 'This resource represents your Layer with name '
//     + `${data.arn.split(':')[6]}. `
//     + 'To download the content of your Layer, '
//     + `go to the layers section on the console`,
//   properties: {
//     ContentUri: `./${data.arn.split(':')[6]}`, // we create this folder in "save" task
//     LayerName: data.arn.split(':')[6],
//     CompatibleRuntimes: data.runtimes || undefined,
//   },
// });

/**
 * Transforms a single relation as displayed by the triggers list into the
 * format expected by our export system:
 *
 *   {
 *       "messages": [Message] (top-level messages for this integration type)
 *       "eventResources": [EventResource]
 *   }
 *
 * Message:
 *
 *   {
 *       "level": string ("INFO" or "WARN")
 *       "message": string (ID of the localized string to display)
 *   }
 *
 * EventResource:
 *
 *   {
 *       "key": string (unique key for a particular resources, e.g. "SNS1")
 *       "type": string (resource type, e.g. "SNS")
 *       "comment": string (optional in template comment displated above the key)
 *       "reference": EventResource (optional reference to another resource(s))
 *       "properties": { string: object }
 *       "messages": [Message] (per-resource messages)
 *   }
 *
 * #NOTE: messages on a "reference" EventResource will not be displayed!
 *
 * This moves away from the previous server-side system. Rationale:
 *
 *   1. The resources SAM supports are a subset of the triggers the console
 *      supports. It makes sense to capture that difference in a central place
 *      to update when SAM evolves.
 *   2. Until we come up with a generally good way to tackle output format,
 *      what we do here should not be baked into Vertex.
 *
 * @param id {string} ID of the integration, e.g. "sns"
 * @param index {number} index of this integration type in the batch
 * @param data {object} relation data used by the triggers list
 */
function transformSingle(id: string, index: number, data: Record<string, any>): TransformResult {
    // #NOTE: unpack data.data for new relations, pass whole object otherwise
    return (TRANSFORMERS[id] || DEFAULT_EXPORT)(index + 1, data.data || data)
}

const flattenBatch = (batch?: Collection<number, TransformResult>) => ({
    messages: batch!.flatMap((r) => List(r!.messages)).toArray(),
    eventResources: batch!.flatMap((r) => List(r!.eventResources)).toArray(),
})

export const transformRelations = (relations: Record<string, any>[]) =>
    List(relations)
        .groupBy((r) => r!.id)
        .map((batch, id) => batch!.map((r, i) => transformSingle(id, i!, r!)))
        .map(flattenBatch)
        .toArray()

/* Function/main */

// Remove unsupported characters from a string so that it can be used as the
// logical ID of a CloudFormation resource
const sanitizeForLogicalId = (s: string) => s.replace(/[-_]/g, '')

// Given an object, return the same object with capitalized first letters on all keys
const toPascalCase = (k: string) => k.charAt(0).toUpperCase() + k.slice(1)
//const pascalCaseObject = (obj: any) => deepTransform(obj, toPascalCase);

// // Since this property name will be replaced by regex, we try to use a unique
// // property name so the regex expression will not replace any unintentional strings
// const commentPrefixToReplace = 'commentForSam';
// const commentSuffixToReplace = '522024';
// const reduceResources = (resources: Resource[]) => resources.reduce((map: Record<string, any>, resource: Resource) => {
//   const value: Record<string, any> = { Type: resource.type };
//   if (resource.properties) {
//     value.Properties = resource.properties;
//   }
//   if (resource.comment) {
//     return { ...map,
//       [`${commentPrefixToReplace}${resource.key}${commentSuffixToReplace}`]: `${resource.comment}</comment>`,
//       [resource.key]: value };
//   }
//   return { ...map, [resource.key]: value };
// }, {});

// /**
//  * Helper function to return resources that need to be generalized
//  *
//  * @param resources - resources to be grouped by IAM type
//  * @param iamType - An object that maps resource types to their corresponding IAM types.
//  * @param resourcesToReplace - An object containing all resourcesToReplace so far grouped by the resource IAM types.
//  *
//  * returns an object containing all resources to be replaced grouped by the resource IAM types.
//  * Example return:
//  * {
//  *  'logs': ['CloudWatchLogs1', 'ClouWatchLogs2'],
//  *  'sqs' : ['SQSQueue1']
//  * }
//  *
//  */
// const generalizeResources = (resources: Object, iamType: Record<string, string>, resourcesToReplace: Record<string, string[]>): Record<string, string[]> => {
//   const res: Record<string, string[]> = resourcesToReplace;
//   Object.entries(resources).forEach(([key, val]: [string, any]) => {
//     const type = val.Type;
//     if (iamType[type]) {
//       res[iamType[type]]
//         ? res[iamType[type]].push(key)
//         : res[iamType[type]] = [key];
//     }
//   });
//   return res;
// };

/**
 * Lambda function properties supported by our SAM transform. We keep an
 * explicit list because we want to ensure the transform is correct, and new
 * properties are not guaranteed to behave in a predictable way between Lambda
 * and CloudFormation.
 *
 * To add a new property, add its key to SUPPORTED_FUNCTION_PROPERTIES. This
 * should be its name in SAM except camel-cased (lowercase first letter). By
 * default the property value will be copied directly from the same-named key
 * in the `lambda` input. If you're lucky and the new property's API design
 * isn't terrible, this should be all you have to do.
 *
 * If you're adding support for a preview feature, you can add its gate name
 * to FUNCTION_PROPERTY_FEATURES. This will only copy the property if the
 * feature is ungated.
 *
 * If there are differences between Lambda and CloudFormation, you can use
 * FUNCTION_PROPERTY_VALUE_OVERRIDES and FUNCTION_PROPERTY_SETTER_OVERRIDES to
 * implement special logic. The former is for returning the property's value
 * from the `lambda` input. Return undefined if you don't want anything to be
 * copied into the generated template. The latter is for setting the property
 * in the template given a defined value.
 */
const SUPPORTED_FUNCTION_PROPERTIES: string[] = [
    // code properties
    'sourceKMSKeyArn',
    // Basic properties
    'description',
    'memorySize',
    'timeout',
    'handler',
    'runtime',
    // Other properties
    'architectures',
    'codeSigningConfigArn',
    'deadLetterQueue',
    'ephemeralStorage',
    'environmentVariables', // Bogus property
    'eventInvokeConfig',
    'fileSystemConfigs',
    'functionUrlConfig',
    'imageUri',
    'kmsKeyArn',
    'layers',
    'packageType',
    'policies',
    'publicAccessBlockConfig',
    'recursiveLoop',
    'reservedConcurrentExecutions',
    'role',
    'snapStart',
    'runtimeManagementConfig',
    'tags',
    'tracing',
    'vpcConfig',
    // "Second pass" properties depending on a structure set up by the properties above
    'ipv6AllowedForDualStack',
    'maximumEventAgeInSeconds', // Sub-property of eventInvokeConfig
    'maximumRetryAttempts', // Sub-property of eventInvokeConfig
]
const FUNCTION_PROPERTY_VALUE_OVERRIDES: Record<string, (lambda: Record<string, any>) => any> = {
    deadLetterQueue: ({ dlq, dlqArn }) =>
        dlq !== 'None' && dlqArn ? { Type: dlq.toUpperCase(), TargetArn: dlqArn } : undefined,
    eventInvokeConfig: ({ eventInvokeConfig }) => (eventInvokeConfig ? {} : undefined),
    environmentVariables: ({ envVars }) => (Object.keys(envVars ?? {}).length > 0 ? envVars : undefined),
    fileSystemConfigs: ({ fileSystemConfigs }) =>
        fileSystemConfigs?.length > 0
            ? fileSystemConfigs.map((config: any) => ({ Arn: config.arn, LocalMountPath: config.localMountPath }))
            : undefined,
    // functionUrlConfig: ({ functionUrlConfig }) => {
    //   if (!functionUrlConfig) {
    //     return undefined;
    //   }
    //   const value: Record<string, any> = { AuthType: functionUrlConfig.authType, InvokeMode: functionUrlConfig.invokeMode };
    //   if (functionUrlConfig.cors) {
    //     value.Cors = pascalCaseObject(functionUrlConfig.cors);
    //     if (!functionUrlConfig.cors.maxAge) {
    //       // Ensure we set the default value when not configured, which is 0. If
    //       // we leave it as undefined an error gets thrown on deploy.
    //       value.Cors.MaxAge = 0;
    //     }
    //   }
    //   return value;
    // },
    kmsKeyArn: ({ kmsKeyArn }) => kmsKeyArn || undefined, // We want to consider empty string as undefined
    // only return cross account layers, we deal with customer managed layers in transformToSamObject function
    // layers: ({ layers }) => (layers?.length > 0 ? layers.reduce((a: string[], b: LayerData) => {
    //   if (b.crossAccount) {
    //     return [...a, b.arn];
    //   }
    //   return a;
    // }, []) : undefined),
    // maximumEventAgeInSeconds: ({ eventInvokeConfig }) => eventInvokeConfig?.maxEventAge,
    // maximumRetryAttempts: ({ eventInvokeConfig }) => eventInvokeConfig?.maxRetryAttempts,
    // memorySize: (lambda) => lambda.memory,
    // policies: ({ inlineRoleAndPolicies }) => {
    //   if (!inlineRoleAndPolicies || inlineRoleAndPolicies.partial) {
    //     // We don't have full data about the role policies
    //     return undefined;
    //   }
    //   const statements = inlineRoleAndPolicies.policies
    //     .flatMap((policy: any) => (Array.isArray(policy.document.Statement)
    //       ? policy.document.Statement.map((s: any) => ({ ...s, type: policy.type }))
    //       : ({ ...policy.document.Statement, type: policy.type })))
    //     .map((statement: any) => ({
    //       ...statement,
    //       // Action needs to be an array to satisfy SAM spec
    //       Action: typeof statement.Action === 'string' ? [statement.Action] : statement.Action,
    //     }));
    //   return [{ Statement: statements }];
    // },
    role: ({ inlineRoleAndPolicies, roleData }) => {
        if (inlineRoleAndPolicies && !inlineRoleAndPolicies.partial) {
            // We have actual full data about the role policies, use that instead
            return undefined
        }
        return roleData.roleSelectionType === 'existing' ? roleData.existingRole : undefined
    },
    runtime: ({ runtime, packageType }) => (packageType === 'Zip' ? runtime : undefined),
    tags: ({ tags }) => (tags?.length > 0 ? Map(tags.map((tag: any) => [tag.key, tag.value])).toJS() : undefined),
    tracing: ({ tracer, tracerMode }) => (tracer ? tracerMode : undefined),
    vpcConfig: ({ securityGroupIds, subnetIds }) =>
        securityGroupIds?.length > 0 ? { SecurityGroupIds: securityGroupIds, SubnetIds: subnetIds } : undefined,
}
/* eslint-disable no-param-reassign, no-return-assign */
const FUNCTION_PROPERTY_SETTER_OVERRIDES: Record<string, (properties: Record<string, any>, value: any) => void> = {
    ephemeralStorage: (properties, value) => (properties.EphemeralStorage = { Size: value }),
    environmentVariables: (properties, value) => (properties.Environment = { Variables: value }),
    ipv6AllowedForDualStack: (properties, value) => {
        if (properties.VpcConfig) {
            properties.VpcConfig.Ipv6AllowedForDualStack = value
        }
    },
    maximumEventAgeInSeconds: (properties, value) => {
        if (properties.EventInvokeConfig) {
            properties.EventInvokeConfig.MaximumEventAgeInSeconds = value
        }
    },
    maximumRetryAttempts: (properties, value) => {
        if (properties.EventInvokeConfig) {
            properties.EventInvokeConfig.MaximumRetryAttempts = parseInt(value, 10)
        }
    },
    snapStart: (properties, value) => (properties.SnapStart = { ApplyOn: value }),
}

// const DESTINATION_TYPES_TO_IAM: Record<string, string> = {
//   'AWS::Events::EventBus': 'events',
//   'AWS::Lambda::Function': 'lambda',
//   'AWS::SNS::Topic': 'sns',
//   'AWS::SQS::Queue': 'sqs',
//   'AWS::S3::Bucket': 's3',
// };

// // ApiGateway, IoT, EventBridge, DynamoDB
// // resources will be generated on SAM deploy
// // SAM will take care of those permissions
// // Kafka does not have an associated AWS resource
// const EVENT_TYPES_TO_IAM: Record<string, string> = {
//   'Alexa::ASK::Skill': 'alexa',
//   'AWS::AmazonMQ::Broker': 'mq',
//   'AWS::Cognito::UserPool': 'cognito',
//   'AWS::DynamoDB::Table': 'dynamo',
//   'AWS::Kinesis::Stream': 'kinesis',
//   'AWS::KMS::Key': 'kms',
//   'AWS::Logs::LogGroup': 'logs',
//   'AWS::MSK::Cluster': 'msk',
//   'AWS::S3::Bucket': 's3',
//   'AWS::SNS::Topic': 'sns',
//   'AWS::SQS::Queue': 'sqs',
// };

interface LambdaData {
    functionName: string
    [k: string]: any
}
interface TransformInput {
    lambda: LambdaData
    relations: Record<string, any>[]
}

/**
 * Transform input data from the function designer page into an object
 * representing a SAM template.
 *
 * #TODO support versions/aliases, OCI
 */
export const transformToSamObject = ({ lambda, relations }: TransformInput) => {
    const properties: Record<string, any> = { CodeUri: '.' }
    // let permissionsToReplace: Record<string, string[]> = {
    //   lambda: [sanitizeForLogicalId(lambda.functionName)],
    // };
    // Function
    SUPPORTED_FUNCTION_PROPERTIES.forEach((property) => {
        let value = lambda[property]
        if (FUNCTION_PROPERTY_VALUE_OVERRIDES[property]) {
            value = FUNCTION_PROPERTY_VALUE_OVERRIDES[property](lambda)
        }

        if (value !== null && value !== undefined) {
            // eslint-disable-next-line no-return-assign
            const setter =
                FUNCTION_PROPERTY_SETTER_OVERRIDES[property] ?? (() => (properties[toPascalCase(property)] = value))
            setter(properties, value)
        }
    })

    // // Layers
    // // For layers that are not AWS vended layers or cross account layers,
    // // we create a generalized resource and reference in function properties
    // const customerOwnedLayers = lambda.layers.filter((d: LayerData) => !d.crossAccount);
    // const layerResources = reduceResources(customerOwnedLayers.map((d: LayerData, i: number) => LAYER_TRANSFORMER(i + 1, d)));
    // if (customerOwnedLayers.length > 0) {
    //   // eslint-disable-next-line no-param-reassign
    //   const referenceLayers = customerOwnedLayers.map((d: LayerData, i: number) => `!Ref Layer${++i}`);
    //   properties.Layers = [...properties.Layers, ...referenceLayers];
    // }

    // // Inline policies

    // // Relations
    // const transformResponses = transformRelations(relations);
    // const events = transformResponses.flatMap((event: any) => event.eventResources);
    // let eventResources = {};
    // if (events.length > 0) {
    //   properties.Events = reduceResources(events.filter((event) => event.key));
    //   eventResources = reduceResources(events.filter((event) => (event.reference?.length ?? 0) > 0).flatMap((event) => event.reference) as Resource[]);
    // }
    // // Destinations
    // let destinationResources;
    // if (Object.keys(lambda.eventInvokeConfig?.destinationConfig ?? {}).length > 0) {
    //   const resources: Resource[] = [];
    //   const config = lambda.eventInvokeConfig?.destinationConfig;
    //   const destinationConfig: Record<string, any> = {};
    //   const typeMap: Record<Destination, string> = {
    //     events: 'EventBridge',
    //     lambda: 'Lambda',
    //     sns: 'SNS',
    //     sqs: 'SQS',
    //   };
    //   const setDestinationConfigFor = (destType: string, index: number) => {
    //     if (Object.keys(config[`on${destType}`]).length > 0) {
    //       destinationConfig[`On${destType}`] = {};
    //       const arn = config[`on${destType}`].destination;
    //       const type = arn.split(':')[2] as Destination;
    //       const transformed = DESTINATION_TRANSFORMERS[type](destType, index);
    //       destinationConfig[`On${destType}`].Destination = { Ref: transformed[0].key };
    //       resources.push(...transformed);
    //       destinationConfig[`On${destType}`].Type = typeMap[type];
    //     }
    //   };
    //   ['Failure', 'Success'].forEach((destType, i) => setDestinationConfigFor(destType, i + 1));
    //   destinationResources = reduceResources(resources);
    //   properties.EventInvokeConfig.DestinationConfig = destinationConfig;
    // }

    // // Policies - generalize hardcoded resource ARNs for destination and triggers
    // // triggers resources to generalize
    // if (eventResources) {
    //   permissionsToReplace = generalizeResources(eventResources, EVENT_TYPES_TO_IAM, permissionsToReplace);
    // }
    // // destination resources to generalize
    // if (destinationResources) {
    //   permissionsToReplace = generalizeResources(destinationResources, DESTINATION_TYPES_TO_IAM, permissionsToReplace);
    // }
    // if (properties.Policies) {
    //   properties.Policies[0].Statement.map((statement: any) => {
    //     // Update Allow and non AWS managed policies statements
    //     if (statement.Effect === 'Allow' && statement.type !== 'managed') {
    //       const resources: string[] = [];
    //       // Get service resource identifiers by parsing statement actions. Ex: log from log:*
    //       // Using the identifers to returns relevant resources found in permisionsToReplace
    //       // ex: permissinsToReplace['log']: ['CloudWatchLogs1', 'CloudWatchLogs2']
    //       statement.Action
    //         .map((a: string) => a.split(':')[0])
    //         .forEach((iamIdentifier: string) => {
    //           if (permissionsToReplace[iamIdentifier]) {
    //             permissionsToReplace[iamIdentifier].forEach((resource: string) => {
    //             // prevents duplication in the case of multiple actions from the same service
    //               if (!resources.find((r: string) => r === resource)) {
    //                 resources.push(...permissionsToReplace[iamIdentifier]);
    //               }
    //             });
    //           }
    //         });
    //       if (resources.length) {
    //         // eslint-disable-next-line no-param-reassign
    //         statement.Resource = resources.map((d: string) => getAtt(d, '', 'Arn'));
    //       }
    //     }
    //     // eslint-disable-next-line no-param-reassign
    //     delete statement.type;
    //     return statement;
    //   });
    // }

    // const resources = { ...eventResources, ...destinationResources, ...layerResources };
    // const comments = Object.entries(resources)
    //   .filter(([key]) => key.match(new RegExp(`${commentPrefixToReplace}.*${commentSuffixToReplace}`)))
    //   .map(([key, val]) => ({ key, comment: val }));

    // Final template
    return {
        template: {
            AWSTemplateFormatVersion: '2010-09-09',
            Transform: 'AWS::Serverless-2016-10-31',
            Description: 'An AWS Serverless Application Model template describing your function.',
            Resources: {
                [sanitizeForLogicalId(lambda.functionName)]: {
                    Type: 'AWS::Serverless::Function',
                    Properties: properties,
                },
                // ...eventResources,
                // ...destinationResources,
                // ...layerResources,
            },
        },
        // comments,
    }
}

// Parse a comment string so it fits nicely into the editor
// and includes the required #'s
// https://stackoverflow.com/questions/14484787/wrap-text-in-javascript
export const parseComment = (comment: string, trimLine = false) =>
    comment
        .replace(/(?![^\n]{1,80}$)([^\n]{1,80})\s/g, '$1\n')
        .split('\n')
        .map((e) => (trimLine ? `# ${e.trim()}` : `# ${e}`))
        .join('\n')

// Format the localized disclaimer so it doesn't require horizontal scrolling on the Ace
export const getDisclaimer = () =>
    parseComment(
        `This AWS SAM template has been generated from your function's configuration. If your function has one or more triggers, note that the AWS resources associated with these triggers aren't fully specified in this template and include placeholder values. Open this template in AWS Infrastructure Composer or your favorite IDE and modify it to specify a serverless application with other AWS resources.`
    )

/**
 * Transform input data from the function designer page into a SAM template
 * YAML string suitable for giving to the customer.
 */
export const transform = (input: TransformInput) => {
    const { template } = transformToSamObject(input)
    const rawSamFile = yaml.dump(template)
    // js-yaml automatically wraps all strings that start with '!' in
    // single quotes. This causes the '!GetAtt' to be invalid SAM format
    // so we manually replace all the offending strings with correct format
    // #TODO: use regex to match all cases of this instead of replacing every individual value
    let samFile = rawSamFile
        .replaceAll(/'(!GetAtt.*|!Ref.*|!Sub.*)'/g, '$1')
        .replaceAll(
            /'!GetAtt DocumentDBClusterPassword\d\.Value'/g,
            `!GetAtt DocumentDBClusterPassword1.Value # To protect the security of your account, passwords for Amazon DocumentDB are stored as SSM parameters in AWS Systems Manager Parameter Store.`
        )

    // Format each comment above the relevant resource
    // TODO: comments are not indented properly, the first comment line is properly
    // lined up with the resource but the subsequent comment lines are all left aligned (no indentation)
    // https://stackoverflow.com/questions/6109882/regex-match-all-characters-between-two-strings
    // const commentsToReplace = comments.map(({ key }) => samFile.match(new RegExp(
    //   `(?<=${key}: >-\n)(.*?)(?=</comment>)`, 's',
    // )));
    // commentsToReplace.forEach((comment) => {
    //   samFile = samFile.replace(comment![0], parseComment(comment![0], true).trim());
    // });
    // comments.forEach(({ key }) => {
    //   samFile = samFile.replace(new RegExp(`${key}: >-\n`, 'g'), '');
    // });
    samFile = samFile.replaceAll('</comment>', '')

    return `${getDisclaimer()}\n${samFile}`
}
