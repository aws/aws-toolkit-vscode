// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
        @JvmField val AWS = IconLoader.getIcon("/icons/logos/AWS.svg") // 16x16
        @JvmField val IAM_LARGE = IconLoader.getIcon("/icons/logos/IAM_large.svg") // 646x64
        @JvmField val LAMBDA = IconLoader.getIcon("/icons/logos/Lambda.svg") // 16x16
        @JvmField val S3 = IconLoader.getIcon("/icons/logos/S3.svg") // 16x16
        @JvmField val S3_LARGE = IconLoader.getIcon("/icons/logos/S3_Large.svg") // 64x64
    }

    object Resources {
        @JvmField val LAMBDA_FUNCTION = IconLoader.getIcon("/icons/resources/LambdaFunction.svg") // 16x16
        @JvmField val S3_BUCKET = IconLoader.getIcon("/icons/resources/S3Bucket.svg") // 16x16
    }

    object Actions {
        @JvmField val LAMBDA_FUNCTION_NEW: Icon = LayeredIcon.create(Resources.LAMBDA_FUNCTION, AllIcons.Actions.New)
    }
}
