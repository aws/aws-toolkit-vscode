// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.iam

import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.iam.model.Role
import kotlin.streams.asSequence

fun IamClient.listRolesFilter(predicate: (Role) -> Boolean): Sequence<Role> = this.listRolesPaginator().roles().stream().asSequence().filter(predicate)

data class IamRole(val arn: String) {
    override fun toString(): String = name ?: arn

    val name: String? by lazy {
        ARN_REGEX.matchEntire(arn)?.groups?.elementAtOrNull(1)?.value
    }

    companion object {
        private val ARN_REGEX = "arn:.+:iam::.+:role/(.+)".toRegex()
    }
}