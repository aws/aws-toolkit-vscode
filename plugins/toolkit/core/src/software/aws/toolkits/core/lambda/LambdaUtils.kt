// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.lambda

import software.amazon.awssdk.services.lambda.model.Architecture
import software.amazon.awssdk.services.lambda.model.Runtime

val Runtime?.validOrNull: Runtime? get() = this?.takeUnless { it == Runtime.UNKNOWN_TO_SDK_VERSION }
val Architecture?.validOrNull: Architecture? get() = this?.takeUnless { it == Architecture.UNKNOWN_TO_SDK_VERSION }
