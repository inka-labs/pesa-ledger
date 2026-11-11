@echo off
rem Installs or updates Pesa Ledger for you (no administrator rights needed). Double-click it.
title Pesa Ledger installer
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\packaging\windows\install.ps1" -Source "%~dp0app"
