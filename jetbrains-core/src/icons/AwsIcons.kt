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
        @JvmField val S3_LARGE = IconLoader.getIcon("/icons/logos/S3_Large.svg") // 64x64
        @JvmField val CLOUD_FORMATION_TOOL = IconLoader.getIcon("/icons/logos/CloudFormationTool.svg") // 13x13
    }

    object Resources {
        @JvmField val CLOUDFORMATION_STACK = IconLoader.getIcon("/icons/resources/CloudFormationStack.svg") // 16x16
        @JvmField val LAMBDA_FUNCTION = IconLoader.getIcon("/icons/resources/LambdaFunction.svg") // 16x16
        @JvmField val SERVERLESS_APP = IconLoader.getIcon("/icons/resources/ServerlessApp.svg") // 16x16
        object Ecs {
            @JvmField val ECS_CLUSTER = IconLoader.getIcon("/icons/resources/ecs/EcsCluster.svg")
            @JvmField val ECS_SERVICE = IconLoader.getIcon("/icons/resources/ecs/EcsService.svg")
            @JvmField val ECS_TASK_DEFINITION = IconLoader.getIcon("/icons/resources/ecs/EcsTaskDefinition.svg")
        }
    }

    object Actions {
        @JvmField val LAMBDA_FUNCTION_NEW: Icon = LayeredIcon.create(Resources.LAMBDA_FUNCTION, AllIcons.Actions.New)
    }
}
