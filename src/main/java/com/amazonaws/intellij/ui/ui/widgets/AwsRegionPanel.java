package com.amazonaws.intellij.ui.ui.widgets;

import com.amazonaws.intellij.core.region.AwsRegion;
import com.amazonaws.intellij.core.region.AwsRegionManager;
import com.intellij.openapi.ui.ComboBox;

import javax.swing.*;
import java.awt.*;
import java.awt.event.ActionListener;
import java.util.Optional;

/**
 * Created by zhaoxiz on 7/28/17.
 */
public class AwsRegionPanel {
    private JPanel regionPanel;
    private ComboBox<AwsRegion> regionCombo;

    public AwsRegionPanel(String defaultRegion) {

        regionCombo.setRenderer(new DefaultListCellRenderer() {
            @Override
            public Component getListCellRendererComponent(JList list, Object value, int index, boolean isSelected, boolean cellHasFocus) {
                JLabel label = (JLabel) super.getListCellRendererComponent(list, value, index, isSelected, cellHasFocus);
                label.setIcon(((AwsRegion) value).getIcon());
                return label;
            }
        });

        AwsRegionManager.INSTANCE.getRegions().forEach((region)-> {regionCombo.addItem(region);});
        selectRegion(defaultRegion);
    }

    public void addActionListener(ActionListener actionListener) {
        regionCombo.addActionListener(actionListener);
    }

    public JPanel getRegionPanel() {
        return regionPanel;
    }

    private void selectRegion(String regionId) {

        AwsRegionManager.INSTANCE.getRegions().stream().filter((region) -> region.getId().equals(regionId))
                .findFirst().ifPresent((region) -> {regionCombo.setSelectedItem(region);});

    }

    public String getSelectedRegion() {
        assert ((AwsRegion) regionCombo.getSelectedItem()) != null;
        return ((AwsRegion) regionCombo.getSelectedItem()).getId();
    }

}
