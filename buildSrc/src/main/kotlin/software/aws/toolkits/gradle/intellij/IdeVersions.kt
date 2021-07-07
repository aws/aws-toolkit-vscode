// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.intellij

import org.gradle.api.Project
import org.gradle.api.provider.Provider
import org.gradle.api.provider.ProviderFactory

enum class IdeFlavor { IC, IU, RD }

object IdeVersions {
    private val commonPlugins = arrayOf(
        "org.jetbrains.plugins.terminal",
        "org.jetbrains.plugins.yaml"
    )

    private val ideProfiles = listOf(
        Profile(
            name = "2020.2",
            community = ProductProfile(
                sdkFlavor = IdeFlavor.IC,
                sdkVersion = "2020.2",
                plugins = commonPlugins + listOf(
                    "java",
                    "com.intellij.gradle",
                    "org.jetbrains.idea.maven",
                    "PythonCore:202.6397.124",
                    "Docker:202.6397.93"
                )
            ),
            ultimate = ProductProfile(
                sdkFlavor = IdeFlavor.IU,
                sdkVersion = "2020.2",
                plugins = commonPlugins + listOf(
                    "JavaScript",
                    "JavaScriptDebugger",
                    "com.intellij.database",
                    "Pythonid:202.6397.98",
                    "org.jetbrains.plugins.go:202.6397.20"
                )
            ),
            rider = RiderProfile(
                sdkVersion = "2020.2",
                plugins = commonPlugins + listOf(
                    "rider-plugins-appender" // Workaround for https://youtrack.jetbrains.com/issue/IDEA-179607
                ),
                rdGenVersion = "0.203.161",
                nugetVersion = "2020.2.0"
            )
        ),
        Profile(
            name = "2020.3",
            community = ProductProfile(
                sdkFlavor = IdeFlavor.IC,
                sdkVersion = "2020.3",
                plugins = commonPlugins + listOf(
                    "java",
                    "com.intellij.gradle",
                    "org.jetbrains.idea.maven",
                    "PythonCore:203.5981.165",
                    "Docker:203.5981.155"
                )
            ),
            ultimate = ProductProfile(
                sdkFlavor = IdeFlavor.IU,
                sdkVersion = "2020.3",
                plugins = commonPlugins + listOf(
                    "JavaScript",
                    "JavaScriptDebugger",
                    "com.intellij.database",
                    "Pythonid:203.5981.165",
                    "org.jetbrains.plugins.go:203.5981.114"
                )
            ),
            rider = RiderProfile(
                sdkVersion = "2020.3",
                plugins = commonPlugins + listOf(
                    "rider-plugins-appender" // Workaround for https://youtrack.jetbrains.com/issue/IDEA-179607
                ),
                rdGenVersion = "0.203.161",
                nugetVersion = "2020.3.0"
            )
        ),
        Profile(
            name = "2021.1",
            community = ProductProfile(
                sdkFlavor = IdeFlavor.IC,
                sdkVersion = "2021.1",
                plugins = commonPlugins + listOf(
                    "java",
                    "com.intellij.gradle",
                    "org.jetbrains.idea.maven",
                    "PythonCore:211.6693.119",
                    "Docker:211.6693.111"
                )
            ),
            ultimate = ProductProfile(
                sdkFlavor = IdeFlavor.IU,
                sdkVersion = "2021.1",
                plugins = commonPlugins + listOf(
                    "JavaScript",
                    // Transitive dependency needed for javascript
                    // Can remove when https://github.com/JetBrains/gradle-intellij-plugin/issues/608 is fixed
                    "com.intellij.css",
                    "JavaScriptDebugger",
                    "com.intellij.database",
                    "Pythonid:211.6693.115",
                    "org.jetbrains.plugins.go:211.6693.111"
                )
            ),
            rider = RiderProfile(
                sdkVersion = "2021.1.1",
                plugins = commonPlugins + listOf(
                    "rider-plugins-appender" // Workaround for https://youtrack.jetbrains.com/issue/IDEA-179607
                ),
                rdGenVersion = "0.211.234",
                nugetVersion = "2021.1.0"
            )
        ),
    ).associateBy { it.name }

    fun ideProfile(project: Project): Profile = ideProfile(project.providers).get()

    fun ideProfile(providers: ProviderFactory): Provider<Profile> = resolveIdeProfileName(providers).map {
        ideProfiles[it] ?: throw IllegalStateException("Can't find profile for $it")
    }

    private fun resolveIdeProfileName(providers: ProviderFactory): Provider<String> =
        providers.environmentVariable("ALTERNATIVE_IDE_PROFILE_NAME").forUseAtConfigurationTime().orElse(
            providers.gradleProperty("ideProfileName").forUseAtConfigurationTime()
        )
}

open class ProductProfile(
    val sdkFlavor: IdeFlavor,
    val sdkVersion: String,
    val plugins: Array<String>
) {
    fun version(): String? = if (!isLocalPath(sdkVersion)) {
        sdkFlavor.name + "-" + sdkVersion
    } else {
        null
    }

    fun localPath(): String? = sdkVersion.takeIf {
        isLocalPath(it)
    }

    private fun isLocalPath(str: String) = str.startsWith("/") || str.getOrNull(1) == ':'
}

class RiderProfile(
    sdkVersion: String,
    plugins: Array<String>,
    val rdGenVersion: String, // https://www.myget.org/feed/rd-snapshots/package/maven/com.jetbrains.rd/rd-gen
    val nugetVersion: String // https://www.nuget.org/packages/JetBrains.Rider.SDK/
) : ProductProfile(IdeFlavor.RD, sdkVersion, plugins)

class Profile(
    val name: String,
    val shortName: String = shortenedIdeProfileName(name),
    val sinceVersion: String = shortName,
    val untilVersion: String = "$sinceVersion.*",
    val community: ProductProfile,
    val ultimate: ProductProfile,
    val rider: RiderProfile,
)

private fun shortenedIdeProfileName(sdkName: String): String {
    val parts = sdkName.trim().split(".")
    return parts[0].substring(2) + parts[1]
}
