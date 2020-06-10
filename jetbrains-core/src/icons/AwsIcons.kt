// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package icons

import com.intellij.icons.AllIcons
import com.intellij.openapi.util.IconLoader
import com.intellij.ui.LayeredIcon
import javax.swing.Icon

/**
 * Lives in `icons` package due to that is how [com.intellij.openapi.util.IconLoader.getReflectiveIcon] works
 */
object AwsIcons {
    object Logos {
        @JvmField val AWS = IconLoader.getIcon("/icons/logos/AWS.svg") // 13x13
        @JvmField val IAM_LARGE = IconLoader.getIcon("/icons/logos/IAM_large.svg") // 64x64
        @JvmField val CLOUD_FORMATION_TOOL = IconLoader.getIcon("/icons/logos/CloudFormationTool.svg") // 13x13
        @JvmField val EVENT_BRIDGE = IconLoader.getIcon("/icons/logos/EventBridge.svg") // 13x13
    }

    object Misc {
        @JvmField val SMILE = IconLoader.getIcon("/icons/misc/smile.svg") // 16x16
        @JvmField val SMILE_GREY = IconLoader.getIcon("/icons/misc/smile_grey.svg") // 16x16
        @JvmField val FROWN = IconLoader.getIcon("/icons/misc/frown.svg") // 16x16
    }

    object Resources {
        @JvmField val CLOUDFORMATION_STACK = IconLoader.getIcon("/icons/resources/CloudFormationStack.svg") // 16x16
        object CloudWatch {
            @JvmField val LOGS = IconLoader.getIcon("/icons/resources/cloudwatchlogs/CloudWatchLogs.svg") // 16x16
            @JvmField val LOGS_TOOL_WINDOW = IconLoader.getIcon("/icons/resources/cloudwatchlogs/CloudWatchLogsToolWindow.svg") // 13x13
            @JvmField val LOG_GROUP = IconLoader.getIcon("/icons/resources/cloudwatchlogs/CloudWatchLogsGroup.svg") // 16x16
        }
        @JvmField val LAMBDA_FUNCTION = IconLoader.getIcon("/icons/resources/LambdaFunction.svg") // 16x16
        @JvmField val SCHEMA_REGISTRY = IconLoader.getIcon("/icons/resources/SchemaRegistry.svg") // 16x16
        @JvmField val SCHEMA = IconLoader.getIcon("/icons/resources/Schema.svg") // 16x16
        @JvmField val SERVERLESS_APP = IconLoader.getIcon("/icons/resources/ServerlessApp.svg") // 16x16
        @JvmField val S3_BUCKET = IconLoader.getIcon("/icons/resources/S3Bucket.svg") // 16x16
        object Ecs {
            @JvmField val ECS_CLUSTER = IconLoader.getIcon("/icons/resources/ecs/EcsCluster.svg")
            @JvmField val ECS_SERVICE = IconLoader.getIcon("/icons/resources/ecs/EcsService.svg")
            @JvmField val ECS_TASK_DEFINITION = IconLoader.getIcon("/icons/resources/ecs/EcsTaskDefinition.svg")
        }
    }

    object Actions {
        @JvmField val LAMBDA_FUNCTION_NEW: Icon = LayeredIcon.create(Resources.LAMBDA_FUNCTION, AllIcons.Actions.New)
        @JvmField val SCHEMA_VIEW: Icon = AllIcons.Actions.Preview
        @JvmField val SCHEMA_CODE_GEN: Icon = AllIcons.Actions.Download
        @JvmField val SCHEMA_SEARCH: Icon = AllIcons.Actions.Search
    }
}
