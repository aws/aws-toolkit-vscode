// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.datagrip

import com.intellij.database.Dbms
import com.intellij.database.dataSource.DatabaseConnectionInterceptor.ProtoConnection
import com.intellij.database.dataSource.LocalDataSource

// FIX_WHEN_MIN_IS_202 merge this one and the 202+ version together into SecretsManagerAuth, 201 is missing Aurora MySQL
fun secretsManagerIsApplicable(dataSource: LocalDataSource): Boolean {
    val dbms = dataSource.dbms
    return dbms == Dbms.MYSQL || dbms == Dbms.POSTGRES || dbms == Dbms.REDSHIFT
}

// FIX_WHEN_MIN_IS_202 merge this one and the 202+ version together into IamAuth, 201 is missing Aurora MySQL
fun iamIsApplicable(dataSource: LocalDataSource): Boolean = dataSource.dbms == Dbms.MYSQL || dataSource.dbms == Dbms.POSTGRES

// FIX_WHEN_MIN_IS_202 merge this one and the 202+ version together into IamAuth, 201 is missing Aurora MySQL
fun validateIamConfiguration(connection: ProtoConnection) {}
