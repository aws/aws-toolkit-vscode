// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import org.junit.rules.ExternalResource
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.Capability
import software.amazon.awssdk.services.cloudformation.model.ChangeSetType
import software.amazon.awssdk.services.cloudformation.model.CloudFormationException
import software.amazon.awssdk.services.cloudformation.model.Parameter
import software.aws.toolkits.jetbrains.services.cloudformation.executeChangeSetAndWait
import software.aws.toolkits.jetbrains.services.cloudformation.waitForChangeSetCreateComplete
import java.util.UUID

class CloudFormationLazyInitRule(
    private val stackName: String,
    private val templateBody: String,
    private val parameters: List<Parameter>,
    private val cloudformationClient: CloudFormationClient
) : ExternalResource() {
    val outputs: Map<String, String> by lazy {
        cloudformationClient.describeStacks {
            it.stackName(stackName)
        }.stacks()
            .first()
            .outputs()
            .map {
                it.outputKey() to it.outputValue()
            }.toMap()
    }

    override fun before() {
        val type = if (stackExists()) {
            println("Ensuring $stackName is up-to-date...")
            ChangeSetType.UPDATE
        } else {
            println("Creating stack $stackName because it does not exist. This may take a while.")
            ChangeSetType.CREATE
        }

        val changeSetArn = cloudformationClient.createChangeSet {
            it.stackName(stackName)
            it.changeSetName("changeset-${UUID.randomUUID()}")
            it.changeSetType(type)
            it.capabilities(
                Capability.CAPABILITY_AUTO_EXPAND,
                Capability.CAPABILITY_NAMED_IAM
            )
            it.parameters(parameters)
            it.templateBody(templateBody)
        }.id()

        // wait for changeset creation to complete
        try {
            cloudformationClient.waitForChangeSetCreateComplete(stackName, changeSetArn)
        } catch (e: Exception) {
            if (e.message?.contains("The submitted information didn't contain changes") == true) {
                cloudformationClient.deleteChangeSet {
                    it.stackName(stackName)
                    it.changeSetName(changeSetArn)
                }
                return
            } else {
                throw e
            }
        }

        cloudformationClient.executeChangeSetAndWait(stackName, changeSetArn)
    }

    private fun stackExists(): Boolean =
        try {
            cloudformationClient.describeStacks {
                it.stackName(stackName)
            }
            true
        } catch (e: CloudFormationException) {
            false
        }
}
