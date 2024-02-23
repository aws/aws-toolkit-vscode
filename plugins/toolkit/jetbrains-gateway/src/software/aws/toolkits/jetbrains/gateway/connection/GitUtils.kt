// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection

import com.intellij.execution.configurations.GeneralCommandLine
import java.net.URI
import java.net.URISyntaxException

const val SSH_AGENT_VAR = "SSH_AUTH_SOCK"

sealed class GitSettings {
    object NoRepo : GitSettings()

    data class CloneGitSettings(val repo: URI, val branch: String) : GitRepoSettings() {
        constructor(repo: String, branch: String) : this(normalizeRepoUrl(repo), branch)
        override val repoName = extractRepoName(repo)
    }

    data class CawsOwnedRepoSettings(override val repoName: String) : GitRepoSettings()

    sealed class GitRepoSettings : GitSettings() {
        abstract val repoName: String
    }
}

fun normalizeRepoUrl(repoUrl: String): URI {
    // https://git-scm.com/docs/git-clone#_git_urls
    val baseUri = try {
        URI(repoUrl)
    } catch (e: URISyntaxException) {
        // couldn't parse as-is, so tack one on to make parser happy
        normalizeSchemelessUri(repoUrl)
    }

    return if (baseUri.scheme == "file" || baseUri.parseServerAuthority().authority != null) {
        baseUri
    } else {
        // no scheme implies ssh. inject this to make our lives much easier
        normalizeSchemelessUri(repoUrl)
    }.normalize().parseServerAuthority()
}

fun extractRepoName(repoUrl: URI): String {
    // honestly probably just take the component after the last slash like [com.intellij.dvcs.repo.ClonePathProvider]
    // but we need to do some parsing anyways to figure out the authority and scheme

    val path = if (isNotOnlyGitPath(repoUrl.path)) {
        repoUrl.path
    } else {
        guessPathFromUri(repoUrl)
    }

    return path
        .trimEnd('/')
        .removeSuffix(".git")
        .trim('/')
        .substringAfterLast('/')
}

fun buildAgentPrimeCommand(repoUri: URI): GeneralCommandLine? {
    val commandLine = GeneralCommandLine("ssh")
        .withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE)
        .withParameters("-o", "AddKeysToAgent=yes", "-T")

    if (repoUri.scheme != "ssh") {
        return null
    }

    val agent = SshAgentService.agentInstance()
    if (agent is SocketBasedSshAgent) {
        commandLine.withEnvironment(SSH_AGENT_VAR, agent.socket)
    }

    val host = buildString {
        repoUri.userInfo?.let { append("$it@") }
        append(repoUri.host)
    }
    commandLine.addParameter(host)

    if (repoUri.port != -1) {
        commandLine.addParameters("-p", repoUri.port.toString())
    }

    return commandLine
}

private fun isNotOnlyGitPath(s: String?): Boolean =
    !s.isNullOrBlank() && s != "/" && s != "/.git" && s != "/.git/"

private fun guessPathFromUri(uri: URI): String =
    when {
        isNotOnlyGitPath(uri.host) -> uri.host
        else -> throw RuntimeException("could not guess a name from $uri")
    }

private fun normalizeSchemelessUri(repoUrl: String): URI {
    // convert SCP-like syntax to protocol-like
    // [user@]host.xz:path/to/repo.git/
    val authority = repoUrl.substringBefore(':', repoUrl)
    val path = repoUrl.substringAfter(':', "")

    return URI("ssh://$authority/$path")
}
