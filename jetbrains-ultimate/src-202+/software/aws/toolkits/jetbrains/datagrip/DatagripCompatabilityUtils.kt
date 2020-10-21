// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.datagrip

import com.intellij.database.Dbms
import com.intellij.database.dataSource.DatabaseConnectionInterceptor.ProtoConnection
import com.intellij.database.dataSource.LocalDataSource
import software.aws.toolkits.resources.message

// FIX_WHEN_MIN_IS_202 merge this one and the 202+ version together into secretsManagerAuth, 201 is missing Aurora MySQL
fun secretsManagerIsApplicable(dataSource: LocalDataSource): Boolean {
    val dbms = dataSource.dbms
    return dbms == Dbms.MYSQL || dbms == Dbms.POSTGRES || dbms == Dbms.REDSHIFT || dbms == Dbms.MYSQL_AURORA
}

// FIX_WHEN_MIN_IS_202 merge this one and the 202+ version together into iamAuth, 201 is missing Aurora MySQL
fun iamIsApplicable(dataSource: LocalDataSource): Boolean =
    dataSource.dbms == Dbms.MYSQL || dataSource.dbms == Dbms.POSTGRES || dataSource.dbms == Dbms.MYSQL_AURORA

// FIX_WHEN_MIN_IS_202 merge this one and the 202+ version together into IamAuth, 201 is missing Aurora MySQL
fun validateIamConfiguration(connection: ProtoConnection) {
    // MariaDB/Mysql aurora will never work if SSL is turned off, so validate and give
    // a good message if it is not enabled
    if (
        connection.connectionPoint.dataSource.dbms == Dbms.MYSQL_AURORA &&
        connection.connectionPoint.dataSource.sslCfg == null
    ) {
        throw IllegalArgumentException(message("rds.validation.aurora_mysql_ssl_required"))
    }
}
