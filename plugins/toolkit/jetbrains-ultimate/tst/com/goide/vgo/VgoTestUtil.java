// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package com.goide.vgo;

import com.goide.GoConstants;
import com.goide.project.GoModuleLibrariesService;
import com.goide.vgo.configuration.VgoProjectSettings;
import com.goide.vgo.mod.psi.VgoFile;
import com.goide.vgo.project.VgoDependency;
import com.goide.vgo.project.VgoDependencyImpl;
import com.goide.vgo.project.VgoModule;
import com.goide.vgo.project.VgoModulesRegistry;
import com.intellij.openapi.application.PathManager;
import com.intellij.openapi.application.ReadAction;
import com.intellij.openapi.util.Disposer;
import com.intellij.openapi.util.Pair;
import com.intellij.openapi.util.io.FileUtil;
import com.intellij.openapi.vfs.VfsUtil;
import com.intellij.openapi.vfs.VfsUtilCore;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.psi.PsiFile;
import com.intellij.psi.PsiManager;
import com.intellij.testFramework.PlatformTestUtil;
import com.intellij.testFramework.TestModeFlags;
import com.intellij.testFramework.VfsTestUtil;
import com.intellij.testFramework.fixtures.CodeInsightTestFixture;
import com.intellij.util.PathUtil;
import com.intellij.util.containers.ContainerUtil;
import java.io.File;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import software.aws.toolkits.jetbrains.go.VgoCompatShims;
import software.aws.toolkits.jetbrains.go.VgoDependencyInstance;

public class VgoTestUtil {
    private static final String GOPATH = getGoTestDataPath("vgo/src/test/testData/mockGoPath").getAbsolutePath();
    private static final Map<String, VgoDependency> DEPENDENCIES =
        ContainerUtil.newHashMap(dependencyPair("vgoDep", "v1.5.2", null, null),
                                 dependencyPair("vgoTransitiveDep", "v1.0.0", null, null),
                                 dependencyPair("customDir", "v0.0.0", "customDirDep@v1.0.0", null),
                                 dependencyPair("originalDep", "v1.0.0", null, dependency("replacedDep", "v1.0.0", null, null)));
    public static final String DEFAULT_IMPORT_PATH = "jetbrains.com/hello";

    @NotNull
    private static Pair<String, VgoDependencyImpl> dependencyPair(@NotNull String importPath,
                                                                  @NotNull String version,
                                                                  @Nullable String dir,
                                                                  @Nullable VgoDependencyImpl replace) {
        VgoDependencyImpl dependency = dependency(importPath, version, dir, replace);
        return Pair.create(dependency.getDirPath(), dependency);
    }

    @NotNull
    private static VgoDependencyImpl dependency(@NotNull String importPath,
                                                @NotNull String version,
                                                @Nullable String dir,
                                                @Nullable VgoDependencyImpl replace) {
        String dirName = dir != null ? dir : String.format("%s@%s", importPath, version);
        String dirPath = FileUtil.join(GOPATH, "pkg", GoConstants.VGO_DIR_NAME, dirName);
        return VgoDependencyInstance.getVgoDependencyImplInstance(importPath, version, null, PathUtil.toSystemIndependentName(FileUtil.toCanonicalPath(dirPath)), replace, false);
    }

    public static PsiFile setupVgoIntegration(@NotNull CodeInsightTestFixture fixture) {
        return setupVgoIntegration(null, DEFAULT_IMPORT_PATH, fixture, DEPENDENCIES);
    }

    public static PsiFile setupVgoIntegration(@Nullable String modulePath,
                                              @NotNull String importPath,
                                              @NotNull CodeInsightTestFixture fixture,
                                              @NotNull Map<String, VgoDependency> dependencies) {
        setupGopath(fixture, null);
        VgoModule module = createVgoModule(fixture, modulePath, importPath, dependencies);
        setupVgoIntegration(fixture, Collections.singletonList(module));
        return getGoModPsiFile(fixture, module);
    }

    @NotNull
    public static VirtualFile setupGopath(@NotNull CodeInsightTestFixture fixture, @Nullable String customGopath) {
        if (customGopath == null) {
            GoModuleLibrariesService.getInstance(fixture.getModule()).setLibraryRootUrls(VfsUtilCore.pathToUrl(GOPATH));
            return VfsTestUtil.findFileByCaseSensitivePath(GOPATH);
        }
        VirtualFile customGopathFile = VfsUtil.findFile(Paths.get(fixture.getTestDataPath(), customGopath), true);
        if (customGopathFile != null) {
            // Sometimes changes in custom gopath directory are not detected by tests, we explicitly refresh to overcome this.
            customGopathFile.refresh(false, true);
            GoModuleLibrariesService.getInstance(fixture.getModule()).setLibraryRootUrls(customGopathFile.getUrl());
            return customGopathFile;
        }
        throw new IllegalArgumentException("Cannot find custom gopath: " + customGopath);
    }

    @NotNull
    // made public
    public static VgoModule createVgoModule(@NotNull CodeInsightTestFixture fixture,
                                            @Nullable String modulePath,
                                            @NotNull String importPath,
                                            @NotNull Map<String, VgoDependency> dependencies) {
        String goModPath = modulePath != null ? FileUtil.join(modulePath, VgoUtil.GO_MOD) : VgoUtil.GO_MOD;
        PsiFile file = fixture.addFileToProject(goModPath, "module \"" + importPath + "\"");
        return VgoCompatShims.newVgoModule(fixture.getProject(), file.getVirtualFile().getParent(), importPath, null, dependencies);
    }

    public static void setupVgoIntegration(@NotNull CodeInsightTestFixture fixture, @NotNull List<VgoModule> modules) {
        TestModeFlags.set(VgoIntegrationManager.DISABLE_TRACKERS, true, fixture.getTestRootDisposable());
        VgoProjectSettings.getInstance(fixture.getProject()).setIntegrationEnabled(true);
        setVgoModules(fixture, modules);
        Disposer.register(fixture.getTestRootDisposable(), () -> {
            VgoProjectSettings.getInstance(fixture.getProject()).setIntegrationEnabled(false);
            VgoModulesRegistry.getInstance(fixture.getProject()).updateAllModules(fixture.getModule(), Collections.emptySet());
            PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue();
        });
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue();
    }

    public static void setVgoModules(@NotNull CodeInsightTestFixture fixture, @NotNull List<VgoModule> modules) {
        for (VgoModule module : modules) {
            VgoModuleInfoProviderForTests.putTestingVgoModule(module, fixture.getTestRootDisposable());
        }
        List<VgoRootToModule> vgoModules =
            ContainerUtil.map(modules, module -> new VgoRootToModule(module.getRoot(), module));
        VgoModulesRegistry.getInstance(fixture.getProject()).updateModules(fixture.getModule(), vgoModules);
    }

    @NotNull
    public static VgoFile getGoModPsiFile(@NotNull CodeInsightTestFixture fixture, @NotNull VgoModule vgoModule) {
        return (VgoFile)VgoTestUtil.getPsiFile(fixture, getGoModFile(vgoModule));
    }

    public static @NotNull VirtualFile getGoModFile(@NotNull VgoModule vgoModule) {
        return vgoModule.getRoot().findChild(VgoUtil.GO_MOD);
    }

    public static @Nullable PsiFile getPsiFile(@NotNull CodeInsightTestFixture fixture, @NotNull VirtualFile virtualFile) {
        return ReadAction.compute(() -> PsiManager.getInstance(fixture.getProject()).findFile(virtualFile));
    }

    @NotNull
    public static File getGoTestDataPath(@NotNull String path) {
        String homePath = PathManager.getHomePath();
        File testData = FileUtil.findFirstThatExist(homePath + "/goland/intellij-go/src/test/testData/" + path, // go tests in ide
                                                    homePath + "/src/test/testData/" + path, // ???
                                                    homePath + "/goland/intellij-go/" + path, // vgo tests in ide
                                                    "src/test/testData/" + path, // go tests
                                                    "../" + path, // vgo tests
                                                    "../src/test/testData/" + path); // go tests in vgo submodule
        return Objects.requireNonNull(testData);
    }
}
