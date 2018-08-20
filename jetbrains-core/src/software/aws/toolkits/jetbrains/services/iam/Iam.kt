package software.aws.toolkits.jetbrains.services.iam

import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.iam.model.Role
import kotlin.streams.asSequence

fun IamClient.listRolesFilter(predicate: (Role) -> Boolean): Sequence<Role> {
    return this.listRolesPaginator().roles().stream().asSequence().filter(predicate)
}