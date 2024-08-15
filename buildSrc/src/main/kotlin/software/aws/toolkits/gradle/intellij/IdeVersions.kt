// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.intellij

import org.gradle.api.Project
import org.gradle.api.provider.Provider
import org.gradle.api.provider.ProviderFactory


enum class IdeFlavor { GW, IC, IU, RD }

object IdeVersions {
    private val commonPlugins = listOf(
        "Git4Idea",
        "org.jetbrains.plugins.terminal",
        "org.jetbrains.plugins.yaml"
    )

    private val ideProfiles = listOf(
        Profile(
            name = "2023.3",
            community = ProductProfile(
                sdkFlavor = IdeFlavor.IC,
                sdkVersion = "2023.3",
                bundledPlugins = commonPlugins + listOf(
                    "com.intellij.java",
                    "com.intellij.gradle",
                    "org.jetbrains.idea.maven",
                ),
                marketplacePlugins = listOf(
                    "PythonCore:233.11799.241",
                    "Docker:233.11799.244"
                )
            ),
            ultimate = ProductProfile(
                sdkFlavor = IdeFlavor.IU,
                sdkVersion = "2023.3",
                bundledPlugins = commonPlugins + listOf(
                    "JavaScript",
                    "JavaScriptDebugger",
                    "com.intellij.database",
                    "com.jetbrains.codeWithMe",
                ),
                marketplacePlugins = listOf(
                    "Pythonid:233.11799.241",
                    "org.jetbrains.plugins.go:233.11799.196",
                )
            ),
            rider = RiderProfile(
                sdkVersion = "2023.3",
                bundledPlugins = commonPlugins,
                netFrameworkTarget = "net472",
                rdGenVersion = "2023.3.2",
                nugetVersion = "2023.3.0"
            )
        ),
        Profile(
            name = "2024.1",
            community = ProductProfile(
                sdkFlavor = IdeFlavor.IC,
                sdkVersion = "2024.1",
                bundledPlugins = commonPlugins + listOf(
                    "com.intellij.java",
                    "com.intellij.gradle",
                    "org.jetbrains.idea.maven",
                ),
                marketplacePlugins = listOf(
                    "org.toml.lang:241.14494.150",
                    "PythonCore:241.14494.240",
                    "Docker:241.14494.251"
                )
            ),
            ultimate = ProductProfile(
                sdkFlavor = IdeFlavor.IU,
                sdkVersion = "2024.1",
                bundledPlugins = commonPlugins + listOf(
                    "JavaScript",
                    "JavaScriptDebugger",
                    "com.intellij.database",
                    "com.jetbrains.codeWithMe",
                ),
                marketplacePlugins = listOf(
                    "org.toml.lang:241.14494.150",
                    "Pythonid:241.14494.314",
                    "org.jetbrains.plugins.go:241.14494.240",
                )
            ),
            rider = RiderProfile(
                sdkVersion = "2024.1",
                bundledPlugins = commonPlugins,
                netFrameworkTarget = "net472",
                rdGenVersion = "2024.1.1",
                nugetVersion = "2024.1.0"
            )
        ),
        Profile(
            name = "2024.2",
            gateway = ProductProfile(
                sdkFlavor = IdeFlavor.GW,
                sdkVersion = "242.20224-EAP-CANDIDATE-SNAPSHOT",
                bundledPlugins = listOf("org.jetbrains.plugins.terminal")
            ),
            community = ProductProfile(
                sdkFlavor = IdeFlavor.IC,
                sdkVersion = "2024.2",
                bundledPlugins = commonPlugins + listOf(
                    "com.intellij.java",
                    "com.intellij.gradle",
                    "org.jetbrains.idea.maven",
                ),
                marketplacePlugins = listOf(
                    "org.toml.lang:242.20224.155",
                    "PythonCore:242.20224.300",
                    "Docker:242.20224.237"
                )
            ),
            ultimate = ProductProfile(
                sdkFlavor = IdeFlavor.IU,
                sdkVersion = "2024.2",
                bundledPlugins = commonPlugins + listOf(
                    "JavaScript",
                    "JavaScriptDebugger",
                    "com.intellij.database",
                    "com.jetbrains.codeWithMe",
                ),
                marketplacePlugins = listOf(
                    "org.toml.lang:242.20224.155",
                    "Pythonid:242.20224.300",
                    "org.jetbrains.plugins.go:242.20224.300",
                )
            ),
            rider = RiderProfile(
                sdkVersion = "2024.2-EAP7-SNAPSHOT",
                bundledPlugins = commonPlugins,
                netFrameworkTarget = "net472",
                rdGenVersion = "2024.1.1",
                nugetVersion = " 2024.2.0-eap07"
            )
        ),

    ).associateBy { it.name }

    fun ideProfile(project: Project): Profile = ideProfile(project.providers).get()

    fun ideProfile(providers: ProviderFactory): Provider<Profile> = resolveIdeProfileName(providers).map {
        ideProfiles[it] ?: throw IllegalStateException("Can't find profile for $it")
    }

    private fun resolveIdeProfileName(providers: ProviderFactory): Provider<String> = providers.gradleProperty("ideProfileName")
}

open class ProductProfile(
    val sdkFlavor: IdeFlavor,
    val sdkVersion: String,
    val bundledPlugins: List<String> = emptyList(),
    val marketplacePlugins: List<String> = emptyList()
)

class RiderProfile(
    sdkVersion: String,
    val netFrameworkTarget: String,
    val rdGenVersion: String, // https://central.sonatype.com/artifact/com.jetbrains.rd/rd-gen/2023.2.3/versions
    val nugetVersion: String, // https://www.nuget.org/packages/JetBrains.Rider.SDK/
    bundledPlugins: List<String> = emptyList(),
    marketplacePlugins: List<String> = emptyList(),
) : ProductProfile(IdeFlavor.RD, sdkVersion, bundledPlugins, marketplacePlugins)

class Profile(
    val name: String,
    val shortName: String = shortenedIdeProfileName(name),
    val sinceVersion: String = shortName,
    val untilVersion: String = "$sinceVersion.*",
    val gateway: ProductProfile? = null,
    val community: ProductProfile,
    val ultimate: ProductProfile,
    val rider: RiderProfile,
)

private fun shortenedIdeProfileName(sdkName: String): String {
    val parts = sdkName.trim().split(".")
    return parts[0].substring(2) + parts[1]
}
