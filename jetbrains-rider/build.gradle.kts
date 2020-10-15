// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
// Cannot be removed or else it will fail to compile
import com.jetbrains.rd.generator.gradle.RdgenParams
import com.jetbrains.rd.generator.gradle.RdgenTask
import org.jetbrains.intellij.tasks.PrepareSandboxTask
import software.aws.toolkits.gradle.IdeVersions

buildscript {
    val rdversion = software.aws.toolkits.gradle.IdeVersions.ideProfile(project).rider.rdGenVersion

    logger.info("Using rd-gen: $rdversion")

    repositories {
        maven("https://www.myget.org/F/rd-snapshots/maven/")
        mavenCentral()
    }

    dependencies {
        classpath("com.jetbrains.rd:rd-gen:$rdversion")
    }
}

plugins {
    id("org.jetbrains.intellij")
}

apply(plugin = "com.jetbrains.rdgen")

val ideProfile = IdeVersions.ideProfile(project)

val resharperPluginPath = File(projectDir, "ReSharper.AWS")
val resharperBuildPath = File(project.buildDir, "dotnetBuild")

val buildConfiguration = project.extra.properties["BuildConfiguration"] ?: "Debug" // TODO: Do we ever want to make a release build?

// Protocol
val protocolGroup = "protocol"

val csDaemonGeneratedOutput = File(resharperPluginPath, "src/AWS.Daemon/Protocol")
val csPsiGeneratedOutput = File(resharperPluginPath, "src/AWS.Psi/Protocol")
val csAwsSettingGeneratedOutput = File(resharperPluginPath, "src/AWS.Settings/Protocol")
val csAwsProjectGeneratedOutput = File(resharperPluginPath, "src/AWS.Project/Protocol")
val riderGeneratedSources = "$buildDir/generated-src/software/aws/toolkits/jetbrains/protocol"

val modelDir = File(projectDir, "protocol/model")
val rdgenDir = File("${project.buildDir}/rdgen/")

rdgenDir.mkdirs()

intellij {
    val parentIntellijTask = rootProject.intellij
    version = ideProfile.rider.sdkVersion
    pluginName = parentIntellijTask.pluginName
    updateSinceUntilBuild = parentIntellijTask.updateSinceUntilBuild

    // Workaround for https://youtrack.jetbrains.com/issue/IDEA-179607
    val extraPlugins = arrayOf("rider-plugins-appender")
    setPlugins(*(ideProfile.rider.plugins + extraPlugins))

    // Disable downloading source to avoid issues related to Rider SDK naming that is missed in Idea
    // snapshots repository. The task is failed because if is unable to find related IC sources.
    downloadSources = false
    instrumentCode = false
}

val generateDaemonModel = tasks.register<RdgenTask>("generateDaemonModel") {
    val daemonModelSource = File(modelDir, "daemon").canonicalPath
    val ktOutput = File(riderGeneratedSources, "DaemonProtocol")

    inputs.property("rdgen", ideProfile.rider.rdGenVersion)
    inputs.dir(daemonModelSource)
    outputs.dirs(ktOutput, csDaemonGeneratedOutput)

    // NOTE: classpath is evaluated lazily, at execution time, because it comes from the unzipped
    // intellij SDK, which is extracted in afterEvaluate
    configure<RdgenParams> {
        verbose = true
        hashFolder = rdgenDir.toString()

        logger.info("Configuring rdgen params")

        classpath({
            logger.info("Calculating classpath for rdgen, intellij.ideaDependency is: ${intellij.ideaDependency}")
            val sdkPath = intellij.ideaDependency.classes
            val rdLibDirectory = File("$sdkPath/lib/rd").canonicalFile
            "$rdLibDirectory/rider-model.jar"
        })

        sources(daemonModelSource)
        packages = "protocol.model.daemon"

        generator {
            language = "kotlin"
            transform = "asis"
            root = "com.jetbrains.rider.model.nova.ide.IdeRoot"
            namespace = "com.jetbrains.rider.model"
            directory = "$ktOutput"
        }

        generator {
            language = "csharp"
            transform = "reversed"
            root = "com.jetbrains.rider.model.nova.ide.IdeRoot"
            namespace = "JetBrains.Rider.Model"
            directory = "$csDaemonGeneratedOutput"
        }
    }
}

val generatePsiModel = tasks.register<RdgenTask>("generatePsiModel") {
    val psiModelSource = File(modelDir, "psi").canonicalPath
    val ktOutput = File(riderGeneratedSources, "PsiProtocol")

    inputs.property("rdgen", ideProfile.rider.rdGenVersion)
    inputs.dir(psiModelSource)
    outputs.dirs(ktOutput, csPsiGeneratedOutput)

    // NOTE: classpath is evaluated lazily, at execution time, because it comes from the unzipped
    // intellij SDK, which is extracted in afterEvaluate
    configure<RdgenParams> {
        verbose = true
        hashFolder = rdgenDir.toString()

        logger.info("Configuring rdgen params")

        classpath({
            logger.info("Calculating classpath for rdgen, intellij.ideaDependency is: ${intellij.ideaDependency}")
            val sdkPath = intellij.ideaDependency.classes
            val rdLibDirectory = File(sdkPath, "lib/rd").canonicalFile
            "$rdLibDirectory/rider-model.jar"
        })

        sources(psiModelSource)
        packages = "protocol.model.psi"

        generator {
            language = "kotlin"
            transform = "asis"
            root = "com.jetbrains.rider.model.nova.ide.IdeRoot"
            namespace = "com.jetbrains.rider.model"
            directory = "$ktOutput"
        }

        generator {
            language = "csharp"
            transform = "reversed"
            root = "com.jetbrains.rider.model.nova.ide.IdeRoot"
            namespace = "JetBrains.Rider.Model"
            directory = "$csPsiGeneratedOutput"
        }
    }
}

val generateAwsSettingModel = tasks.register<RdgenTask>("generateAwsSettingModel") {
    val settingModelSource = File(modelDir, "setting").canonicalPath
    val ktOutput = File(riderGeneratedSources, "AwsSettingsProtocol")

    inputs.property("rdgen", ideProfile.rider.rdGenVersion)
    inputs.dir(settingModelSource)
    outputs.dirs(ktOutput, csAwsSettingGeneratedOutput)

    // NOTE: classpath is evaluated lazily, at execution time, because it comes from the unzipped
    // intellij SDK, which is extracted in afterEvaluate
    configure<RdgenParams> {
        verbose = true
        hashFolder = rdgenDir.toString()

        logger.info("Configuring rdgen params")

        classpath({
            logger.info("Calculating classpath for rdgen, intellij.ideaDependency is: ${intellij.ideaDependency}")
            val sdkPath = intellij.ideaDependency.classes
            val rdLibDirectory = File(sdkPath, "lib/rd").canonicalFile
            "$rdLibDirectory/rider-model.jar"
        })
        sources(settingModelSource)
        packages = "protocol.model.setting"

        generator {
            language = "kotlin"
            transform = "asis"
            root = "com.jetbrains.rider.model.nova.ide.IdeRoot"
            namespace = "com.jetbrains.rider.model"
            directory = "$ktOutput"
        }

        generator {
            language = "csharp"
            transform = "reversed"
            root = "com.jetbrains.rider.model.nova.ide.IdeRoot"
            namespace = "JetBrains.Rider.Model"
            directory = "$csAwsSettingGeneratedOutput"
        }
    }
}

val generateAwsProjectModel = tasks.register<RdgenTask>("generateAwsProjectModel") {
    val projectModelSource = File(modelDir, "project").canonicalPath
    val ktOutput = File(riderGeneratedSources, "AwsProjectProtocol")

    inputs.property("rdgen", ideProfile.rider.rdGenVersion)
    inputs.dir(projectModelSource)
    outputs.dirs(ktOutput, csAwsProjectGeneratedOutput)

    // NOTE: classpath is evaluated lazily, at execution time, because it comes from the unzipped
    // intellij SDK, which is extracted in afterEvaluate
    configure<RdgenParams> {
        verbose = true
        hashFolder = rdgenDir.toString()

        logger.info("Configuring rdgen params")

        classpath({
            logger.info("Calculating classpath for rdgen, intellij.ideaDependency is: ${intellij.ideaDependency}")
            val sdkPath = intellij.ideaDependency.classes
            val rdLibDirectory = File(sdkPath, "lib/rd").canonicalFile
            "$rdLibDirectory/rider-model.jar"
        })

        sources(projectModelSource)
        packages = "protocol.model.project"

        generator {
            language = "kotlin"
            transform = "asis"
            root = "com.jetbrains.rider.model.nova.ide.IdeRoot"
            namespace = "com.jetbrains.rider.model"
            directory = "$ktOutput"
        }

        generator {
            language = "csharp"
            transform = "reversed"
            root = "com.jetbrains.rider.model.nova.ide.IdeRoot"
            namespace = "JetBrains.Rider.Model"
            directory = "$csAwsProjectGeneratedOutput"
        }
    }
}

val generateModels = tasks.register("generateModels") {
    group = protocolGroup
    description = "Generates protocol models"

    dependsOn(generateDaemonModel, generatePsiModel, generateAwsSettingModel, generateAwsProjectModel)
}

val cleanGenerateModels = tasks.register("cleanGenerateModels") {
    group = protocolGroup
    description = "Clean up generated protocol models"

    dependsOn("cleanGenerateDaemonModel", "cleanGeneratePsiModel", "cleanGenerateAwsSettingModel", "cleanGenerateAwsProjectModel")
}

val cleanNetBuilds = task("cleanNetBuilds", Delete::class) {
    group = protocolGroup
    description = "Clean up obj/ bin/ folders under ReSharper.AWS"
    delete(project.fileTree("ReSharper.AWS/") {
        include("**/bin/")
        include("**/obj/")
    })
}

project.tasks.clean {
    dependsOn(cleanGenerateModels, cleanNetBuilds)
}

// Backend
val backendGroup = "backend"

val prepareBuildProps = tasks.register("prepareBuildProps") {
    val riderSdkVersionPropsPath = File(resharperPluginPath, "RiderSdkPackageVersion.props")
    group = backendGroup

    inputs.property("riderNugetSdkVersion", ideProfile.rider.nugetVersion)
    outputs.file(riderSdkVersionPropsPath)

    doLast {
        val riderSdkVersion = ideProfile.rider.nugetVersion
        val configText = """<Project>
  <PropertyGroup>
    <RiderSDKVersion>[$riderSdkVersion]</RiderSDKVersion>
  </PropertyGroup>
</Project>
"""
        riderSdkVersionPropsPath.writeText(configText)
    }
}

val prepareNuGetConfig = tasks.register("prepareNuGetConfig") {
    group = backendGroup

    val nugetConfigPath = File(projectDir, "NuGet.Config")

    inputs.property("rdVersion", ideProfile.rider.sdkVersion)
    outputs.file(nugetConfigPath)

    doLast {
        val nugetPath = getNugetPackagesPath()
        val configText = """<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <add key="resharper-sdk" value="${nugetPath}" />
  </packageSources>
</configuration>
"""
        nugetConfigPath.writeText(configText)
    }
}

val buildReSharperPlugin = tasks.register("buildReSharperPlugin") {
    group = backendGroup
    description = "Builds the full ReSharper backend plugin solution"
    dependsOn(generateModels, prepareBuildProps, prepareNuGetConfig)

    inputs.dir(resharperPluginPath)
    outputs.dir(resharperBuildPath)

    outputs.files({
        fileTree(file("${resharperPluginPath.absolutePath}/src")).matching {
            include("**/bin/Debug/**/AWS*.dll")
            include("**/bin/Debug/**/AWS*.pdb")
        }
    })

    doLast {
        val arguments = listOf(
            "build",
            "${resharperPluginPath.canonicalPath}/ReSharper.AWS.sln",
            "/p:DefineConstants=\"PROFILE_${ideProfile.name.replace(".", "_")}\""
        )
        exec {
            executable = "dotnet"
            args = arguments
        }
    }
}

fun getNugetPackagesPath(): File {
    val sdkPath = intellij.ideaDependency.classes
    println("SDK path: $sdkPath")

    // 2019
    var riderSdk = File(sdkPath, "lib/ReSharperHostSdk")
    // 2020.1
    if (!riderSdk.exists()) {
        riderSdk = File(sdkPath, "lib/DotNetSdkForRdPlugins")
    }

    println("NuGet packages: $riderSdk")
    if (!riderSdk.isDirectory) throw IllegalStateException("$riderSdk does not exist or not a directory")

    return riderSdk
}

dependencies {
    compile(project(":jetbrains-core"))
    testImplementation(project(":jetbrains-core", "testArtifacts"))
}

sourceSets {
    main {
        java.srcDirs("$buildDir/generated-src")
    }
}

val resharperParts = listOf(
    "AWS.Daemon",
    "AWS.Localization",
    "AWS.Project",
    "AWS.Psi",
    "AWS.Settings"
)

// Tasks:
//
// `buildPlugin` depends on `prepareSandbox` task and then zips up the sandbox dir and puts the file in rider/build/distributions
// `runIde` depends on `prepareSandbox` task and then executes IJ inside the sandbox dir
// `prepareSandbox` depends on the standard Java `jar` and then copies everything into the sandbox dir

tasks.withType(PrepareSandboxTask::class.java).configureEach {
    dependsOn(buildReSharperPlugin)

    val files = resharperParts.map { "$resharperBuildPath/bin/$it/$buildConfiguration/${it}.dll" } +
        resharperParts.map { "$resharperBuildPath/bin/$it/$buildConfiguration/${it}.pdb" }
    from(files) {
        into("${intellij.pluginName}/dotnet")
    }
}

tasks.compileKotlin {
    dependsOn(generateModels)
}

tasks.test {
    systemProperty("log.dir", "${intellij.sandboxDirectory}-test/logs")
    useTestNG()
    environment("LOCAL_ENV_RUN", true)
    maxHeapSize = "1024m"
}

tasks.integrationTest {
    useTestNG()
    environment("LOCAL_ENV_RUN", true)
}

tasks.jar {
    archiveBaseName.set("aws-intellij-toolkit-rider")
}
