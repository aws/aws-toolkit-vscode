// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package icons

import com.intellij.icons.AllIcons
import com.intellij.openapi.util.IconLoader
import com.intellij.ui.LayeredIcon
import javax.swing.Icon

/**
 * Lives in `icons` package due to that is how [com.intellij.openapi.util.IconLoader.getReflectiveIcon] works
 */
@Deprecated("Plugin-specific icons should not be declared in shared icons")
object AwsIcons {
    object Logos {
        @JvmField val AWS = load("/icons/logos/AWS.svg") // 13x13

        @JvmField val AWS_SMILE_SMALL = load("/icons/logos/AWS_smile.svg") // 16x16

        @JvmField val AWS_SMILE_LARGE = load("/icons/logos/AWS_smile_Large.svg") // 64x64

        @JvmField val CLOUD_FORMATION_TOOL = load("/icons/logos/CloudFormationTool.svg") // 13x13

        @JvmField val CODE_CATALYST_MEDIUM = load("/icons/logos/Amazon_CodeCatalyst_Medium.svg") // 32x32

        @JvmField val CODE_CATALYST_SMALL = load("/icons/logos/Amazon_CodeCatalyst_Small.svg") // 16x16

        @JvmField val EVENT_BRIDGE = load("/icons/logos/EventBridge.svg") // 13x13

        @JvmField val CODEWHISPERER_LARGE = load("/icons/logos/CodeWhisperer_Large.svg") // 54x54

        @JvmField val AWS_Q = load("/icons/logos/AWS_Q.svg") // 13x13

        @JvmField val AWS_Q_GRADIENT = load("/icons/logos/Amazon-Q-Icon_Gradient_Large.svg") // 54x54

        @JvmField val AWS_Q_GRADIENT_SMALL = load("/icons/logos/Amazon-Q-Icon_Gradient_Medium.svg") // 54x54
    }

    object Misc {
        @JvmField val SMILE = load("/icons/misc/smile.svg") // 16x16

        @JvmField val SMILE_GREY = load("/icons/misc/smile_grey.svg") // 16x16

        @JvmField val FROWN = load("/icons/misc/frown.svg") // 16x16

        @JvmField val LEARN = load("/icons/misc/learn.svg") // 16x16

        @JvmField val JAVA = load("/icons/misc/java.svg") // 16x16

        @JvmField val PYTHON = load("/icons/misc/python.svg") // 16x16

        @JvmField val JAVASCRIPT = load("/icons/misc/javaScript.svg") // 16x16

        @JvmField val TYPESCRIPT = load("/icons/misc/typeScript.svg") // 16x16

        @JvmField val CSHARP = load("/icons/misc/csharp.svg") // 16x16

        @JvmField val NEW = load("/icons/misc/new.svg") // 16x16
    }

    object Resources {
        @JvmField val APPRUNNER_SERVICE = load("/icons/resources/AppRunnerService.svg") // 16x16

        @JvmField val CLOUDFORMATION_STACK = load("/icons/resources/CloudFormationStack.svg") // 16x16

        object CloudWatch {
            @JvmField val LOGS = load("/icons/resources/cloudwatchlogs/CloudWatchLogs.svg") // 16x16

            @JvmField val LOGS_TOOL_WINDOW = load("/icons/resources/cloudwatchlogs/CloudWatchLogsToolWindow.svg") // 13x13

            @JvmField val LOG_GROUP = load("/icons/resources/cloudwatchlogs/CloudWatchLogsGroup.svg") // 16x16
        }

        @JvmField val ECR_REPOSITORY = load("/icons/resources/ECRRepository.svg") // 16x16

        @JvmField val LAMBDA_FUNCTION = load("/icons/resources/LambdaFunction.svg") // 16x16

        @JvmField val SCHEMA_REGISTRY = load("/icons/resources/SchemaRegistry.svg") // 16x16

        @JvmField val SCHEMA = load("/icons/resources/Schema.svg") // 16x16

        @JvmField val SERVERLESS_APP = load("/icons/resources/ServerlessApp.svg") // 16x16

        @JvmField val S3_BUCKET = load("/icons/resources/S3Bucket.svg") // 16x16

        @JvmField val REDSHIFT = load("/icons/resources/Redshift.svg") // 16x16

        object DynamoDb {
            @JvmField val TABLE = load("/icons/resources/dynamodb/DynamoDbTable.svg")
        }

        object Ecs {
            @JvmField val ECS_CLUSTER = load("/icons/resources/ecs/EcsCluster.svg")

            @JvmField val ECS_SERVICE = load("/icons/resources/ecs/EcsService.svg")

            @JvmField val ECS_TASK_DEFINITION = load("/icons/resources/ecs/EcsTaskDefinition.svg")
        }

        object Rds {
            @JvmField val MYSQL = load("/icons/resources/rds/Mysql.svg") // 16x16

            @JvmField val POSTGRES = load("/icons/resources/rds/Postgres.svg") // 16x16
        }

        object Sqs {
            @JvmField val SQS_QUEUE = load("/icons/resources/sqs/SqsQueue.svg") // 16x16

            @JvmField val SQS_TOOL_WINDOW = load("/icons/resources/sqs/SqsToolWindow.svg") // 13x13
        }

        object CodeWhisperer {
            @JvmField val CUSTOM = load("icons/resources/CodewhispererCustom.svg") // 16 * 16

            @JvmField val SEVERITY_INFO = load("/icons/resources/codewhisperer/severity-info.svg")

            @JvmField val SEVERITY_LOW = load("/icons/resources/codewhisperer/severity-low.svg")

            @JvmField val SEVERITY_MEDIUM = load("/icons/resources/codewhisperer/severity-medium.svg")

            @JvmField val SEVERITY_HIGH = load("/icons/resources/codewhisperer/severity-high.svg")

            @JvmField val SEVERITY_CRITICAL = load("/icons/resources/codewhisperer/severity-critical.svg")
        }
    }

    object Actions {
        @JvmField val LAMBDA_FUNCTION_NEW: Icon = LayeredIcon.create(Resources.LAMBDA_FUNCTION, AllIcons.Actions.New)

        @JvmField val SCHEMA_VIEW: Icon = AllIcons.Actions.Preview

        @JvmField val SCHEMA_CODE_GEN: Icon = AllIcons.Actions.Download

        @JvmField val SCHEMA_SEARCH: Icon = AllIcons.Actions.Search
    }

    object CodeTransform {
        @JvmField val TIMELINE_STEP_DARK = load("/icons/resources/codetransform/transform-timeline-step-done.svg") // 16 * 16

        @JvmField val TIMELINE_STEP_LIGHT = load("/icons/resources/codetransform/transform-timeline-step-done-light.svg") // 16 * 16

        @JvmField val CHECKMARK_GREEN = load("/icons/resources/codetransform/greenCheckmark.svg")

        @JvmField val CHECKMARK_GRAY = load("/icons/resources/codetransform/checkmark.svg")

        @JvmField val TIMELINE_STEP = load("/icons/resources/codetransform/transform-timeline-step-done.svg") // 16 * 16
    }

    private fun load(path: String): Icon = IconLoader.getIcon(path, AwsIcons::class.java)
}
