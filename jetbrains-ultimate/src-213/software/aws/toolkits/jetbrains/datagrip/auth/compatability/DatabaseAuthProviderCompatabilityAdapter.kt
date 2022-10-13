// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.datagrip.auth.compatability

import com.intellij.database.dataSource.DatabaseConnectionInterceptor

typealias DatabaseAuthProviderCompatabilityAdapter = com.intellij.database.dataSource.DatabaseAuthProvider

fun DatabaseConnectionInterceptor.ProtoConnection.project() = runConfiguration.project
