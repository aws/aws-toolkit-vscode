// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.deploy;

import com.intellij.execution.filters.TextConsoleBuilder;
import com.intellij.execution.filters.TextConsoleBuilderFactory;
import com.intellij.execution.ui.ConsoleView;
import com.intellij.openapi.Disposable;
import com.intellij.openapi.actionSystem.ActionManager;
import com.intellij.openapi.actionSystem.ActionToolbar;
import com.intellij.openapi.actionSystem.DefaultActionGroup;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.wm.ex.ProgressIndicatorEx;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.ui.components.JBTabbedPane;
import com.intellij.util.ui.JBUI;
import com.intellij.util.ui.UIUtil;

import java.awt.AWTEvent;
import java.awt.BorderLayout;
import java.awt.event.MouseEvent;
import java.util.ArrayList;
import java.util.List;
import javax.swing.JComponent;
import javax.swing.JPanel;
import javax.swing.SwingUtilities;

import software.aws.toolkits.jetbrains.ui.ProgressPanel;

public class SamDeployView implements Disposable {
    private final Project project;
    private final ProgressIndicatorEx progressIndicator;
    private final List<ConsoleView> consoleViews;
    private boolean manuallySelectedTab;
    ProgressPanel progressPanel;
    JPanel content;
    JBTabbedPane logTabs;

    public SamDeployView(Project project, ProgressIndicatorEx progressIndicator) {
        this.project = project;
        this.progressIndicator = progressIndicator;
        this.manuallySelectedTab = false;
        this.consoleViews = new ArrayList<>();
    }

    private void createUIComponents() {
        progressPanel = new ProgressPanel(progressIndicator);
        logTabs = new JBTabbedPane();
        logTabs.setTabComponentInsets(JBUI.emptyInsets());
    }

    public ConsoleView addLogTab(String title) {
        TextConsoleBuilder builder = TextConsoleBuilderFactory.getInstance()
                                                              .createBuilder(project);

        builder.setViewer(false);
        ConsoleView console = builder.getConsole();

        consoleViews.add(console);
        
        UIUtil.invokeLaterIfNeeded(() -> {
            JComponent consoleComponent = console.getComponent();
            consoleComponent.setBorder(IdeBorderFactory.createBorder());

            DefaultActionGroup toolbarActions = new DefaultActionGroup();
            toolbarActions.addAll(console.createConsoleActions());

            ActionToolbar toolbar = ActionManager.getInstance().createActionToolbar("SamDeployLogs", toolbarActions, false);

            JPanel logPanel = new JPanel(new BorderLayout());
            logPanel.setBorder(null);
            logPanel.add(toolbar.getComponent(), BorderLayout.WEST);
            logPanel.add(consoleComponent, BorderLayout.CENTER);

            // Serves the purpose of looking for click events that are on a child of the tab, so that we
            // disable auto-switching tabs as progress proceeds
            UIUtil.addAwtListener(event -> {
                MouseEvent mouseEvent = (MouseEvent) event;
                if (!UIUtil.isActionClick(mouseEvent)) {
                    return;
                }

                if (SwingUtilities.isDescendingFrom(mouseEvent.getComponent(), logPanel)) {
                    manuallySelectedTab = true;
                }
            }, AWTEvent.MOUSE_EVENT_MASK, console);

            logTabs.addTab(title, logPanel);

            if (!manuallySelectedTab) {
                logTabs.setSelectedIndex(logTabs.getTabCount() - 1);
            }
        });
        return console;
    }

    @Override
    public void dispose() {
        consoleViews.forEach(ConsoleView::dispose);
    }
}
