// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import java.time.Duration

object CawsResources {
    val ID = ClientBackedCachedResource(CodeCatalystClient::class, "caws.person.id", Duration.ofDays(1)) {
        val session = verifySession {}

        session.identity()
    }

    val PERSON = ClientBackedCachedResource(CodeCatalystClient::class, "caws.person", Duration.ofDays(1)) {
        val session = verifySession {}

        getUserDetails { it.id(session.identity()) }
    }

    val ALL_SPACES = ClientBackedCachedResource(CodeCatalystClient::class, "caws.orgs", Duration.ofDays(1)) {
        listSpacesPaginator {}
            .items()
            .map { it.name() }
    }

    val ALL_PROJECTS = ClientBackedCachedResource(CodeCatalystClient::class, "caws.projects", Duration.ofDays(1)) {
        val spaces = listSpacesPaginator {}
            .items()
            .map { it.name() }

        spaces.flatMap { space ->
            listAccessibleProjectsPaginator { it.spaceName(space) }
                .items()
                .map { CawsProject(space = space, project = it.name()) }
        }
    }

    fun codeRepositories(cawsProject: CawsProject) =
        ClientBackedCachedResource(CodeCatalystClient::class, "caws.codeRepos.${cawsProject.space}.${cawsProject.project}", Duration.ofDays(1)) {
            listSourceRepositoriesPaginator {
                it.spaceName(cawsProject.space)
                it.projectName(cawsProject.project)
            }.items().map {
                CawsCodeRepository(cawsProject.space, cawsProject.project, it.name())
            }
        }

    fun cloneUrls(cawsCodeRepository: CawsCodeRepository) =
        ClientBackedCachedResource(
            CodeCatalystClient::class,
            "caws.codeRepos.${cawsCodeRepository.space}.${cawsCodeRepository.project}.${cawsCodeRepository.name}.cloneUrls",
            Duration.ofDays(1)
        ) {
            getSourceRepositoryCloneUrls {
                it.spaceName(cawsCodeRepository.space)
                it.projectName(cawsCodeRepository.project)
                it.sourceRepositoryName(cawsCodeRepository.name)
            }.https()
        }
}
