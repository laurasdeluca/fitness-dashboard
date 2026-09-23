# Laur's Fitness Tracker — Apple widgets

This folder contains the shared SwiftUI/WidgetKit implementation for the existing
Laur's Fitness Tracker dashboard.

## What it provides

- iPhone Home Screen widget
- macOS desktop widget
- 7-day load
- training strain
- ATL / CTL
- latest available sleep, HRV, and resting HR
- widget timestamp
- tap-through to the full Vercel dashboard
- 30-minute WidgetKit refresh request

The widget reads the same public Supabase data used by the web dashboard. It does
not use the Supabase service-role key.

## One-time setup

1. Install Xcode from the Mac App Store.
2. Install XcodeGen if it is not already installed:
   brew install xcodegen
3. The existing public Supabase key is already wired into Shared/FitnessData.swift.
   It is the same client-side key used by the web dashboard; never replace it with
   the service-role key.
4. From this directory run:
   xcodegen generate
5. Open LaurFitnessTracker.xcodeproj in Xcode.
6. Set your Apple Developer team under Signing & Capabilities for all four targets.
7. Run LaurFitnessTrackerMac to test the Mac app/widget, or LaurFitnessTracker on
   an iPhone simulator/device.
8. Add “Laur's Fitness Tracker” from the widget gallery.

The system controls the exact refresh time for WidgetKit. The timeline asks for a
refresh about every 30 minutes, and the widget fetches the newest Supabase data
when it refreshes.
