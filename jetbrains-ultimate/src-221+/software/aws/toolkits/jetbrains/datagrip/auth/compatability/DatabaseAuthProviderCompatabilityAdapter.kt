// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.datagrip.auth.compatability

import com.intellij.database.dataSource.DatabaseAuthProvider
import com.intellij.database.dataSource.DatabaseConnectionInterceptor
import com.intellij.database.dataSource.LocalDataSource

interface DatabaseAuthProviderCompatabilityAdapter : DatabaseAuthProvider {
    override fun isApplicable(dataSource: LocalDataSource, level: DatabaseAuthProvider.ApplicabilityLevel): Boolean =
        isApplicable(dataSource)

    fun isApplicable(dataSource: LocalDataSource): Boolean
}

fun DatabaseConnectionInterceptor.ProtoConnection.project() = project
