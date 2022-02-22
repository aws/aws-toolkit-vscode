// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import com.intellij.database.dataSource.DatabaseAuthProvider
import com.intellij.database.dataSource.LocalDataSource

interface DatabaseAuthProviderCompatabilityAdapter : com.intellij.database.dataSource.DatabaseAuthProvider {
    override fun isApplicable(dataSource: LocalDataSource, level: DatabaseAuthProvider.ApplicabilityLevel): Boolean =
        isApplicable(dataSource)

    fun isApplicable(dataSource: LocalDataSource): Boolean
}
