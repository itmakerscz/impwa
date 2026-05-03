import { DB } from './services/db-service.js';
import { WorkService } from './services/work-service.js';
import { l18n } from './services/l18n-service.js';

const { createApp, ref, onMounted, onUnmounted, computed, nextTick, watch } = Vue;

const appConfig = {
    setup() {
        const logs = ref([]);
        const projects = ref([]);
        const currentView = ref('dashboard');
        const historySearch = ref('');
        
        const isClockedIn = ref(localStorage.getItem('isClockedIn') === 'true');
        const project = ref('General');
        const chartProjectFilter = ref('All');
        const reportRange = ref({ start: '', end: '' });
        const elapsedTime = ref('00:00:00');
        let timerInterval = null;
        let chartInstance = null;
        let reportChartInstance = null;

        // --- Localization ---
        const locale = ref(localStorage.getItem('locale') || (navigator.language.startsWith('cs') ? 'cs' : 'en'));
        const t = (key, params) => l18n.t(key, locale.value, params);

        // --- Theme ---
        const isDark = ref(
            localStorage.getItem('theme') === 'dark' || 
            (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
        );

        // --- Dialog & Modal State ---
        const dialog = ref({ show: false, title: '', message: '', type: 'confirm', resolve: null });
        const showProjectModal = ref(false);
        const isEditMode = ref(false);
        const originalProjectName = ref('');
        const newProjectData = ref({ name: '', color: 'oklch(60% 0.18 260)' });
        const editingLog = ref(null);
        const editForm = ref({ timeIn: '', timeOut: '', project: '' });

        const colorPalette = [
            'oklch(65% 0.22 25)', 'oklch(70% 0.18 50)', 'oklch(75% 0.15 75)', 'oklch(80% 0.15 100)',
            'oklch(80% 0.18 135)', 'oklch(75% 0.18 150)', 'oklch(70% 0.18 175)', 'oklch(70% 0.15 200)',
            'oklch(65% 0.18 225)', 'oklch(60% 0.18 260)', 'oklch(60% 0.18 280)', 'oklch(65% 0.18 300)',
            'oklch(70% 0.2 320)', 'oklch(70% 0.2 340)', 'oklch(65% 0.2 350)', 'oklch(65% 0.22 15)'
        ];

        // --- Computed Properties ---
        const stats = computed(() => WorkService.getStats(logs.value));

        const projectSummary = computed(() => 
            WorkService.getProjectSummary(logs.value, projects.value, reportRange.value.start, reportRange.value.end)
        );

        const filteredTotalHours = computed(() => {
            const filter = chartProjectFilter.value;
            const filtered = filter === 'All' ? logs.value : logs.value.filter(l => l.project === filter);
            return filtered.reduce((sum, log) => sum + log.hours, 0).toFixed(2);
        });

        const activeProjectColor = computed(() => {
            const p = projects.value.find(p => p.name === project.value);
            return p ? p.color : 'oklch(60% 0.18 260)';
        });

        const filteredHistory = computed(() => {
            const query = historySearch.value.toLowerCase().trim();
            const sortedLogs = [...logs.value].reverse();
            if (!query) return sortedLogs;

            return sortedLogs.filter(log => {
                const projectName = (log.project || 'General').toLowerCase();
                const timestamp = log.timeIn || log.date || "";
                const dateStr = timestamp ? new Date(timestamp).toLocaleDateString(
                    locale.value === 'cs' ? 'cs-CZ' : 'en-US'
                ).toLowerCase() : "";
                return projectName.includes(query) || dateStr.includes(query);
            });
        });

        const chartTheme = computed(() => ({
            text: isDark.value ? 'oklch(85% 0.01 250)' : 'oklch(45% 0.02 250)',
            grid: isDark.value ? 'oklch(32% 0.02 250)' : 'oklch(92% 0.01 250)'
        }));

        // --- Chart Rendering Logic ---
        const renderChart = async () => {
            await nextTick();
            const canvas = document.getElementById('activityChart');
            if (!canvas || currentView.value !== 'statistics') return;

            if (chartInstance) chartInstance.destroy();

            const chartData = WorkService.getLast7DaysData(logs.value, projects.value, chartProjectFilter.value, locale.value);
            const { text, grid } = chartTheme.value;

            chartInstance = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: chartData.labels,
                    datasets: chartData.datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: {
                            stacked: true,
                            beginAtZero: true,
                            grid: { color: grid },
                            ticks: { color: text }
                        },
                        x: {
                            stacked: true,
                            grid: { display: false },
                            ticks: { color: text }
                        }
                    }
                }
            });
        };

        const renderAllCharts = () => {
            if (currentView.value === 'statistics') {
                renderChart();
                renderReportChart();
            }
        };

        watch(locale, (val) => {
            localStorage.setItem('locale', val);
            renderAllCharts();
        });
        
        const ask = (title, message, type = 'confirm') => {
            return new Promise(resolve => {
                dialog.value = { show: true, title, message, type, resolve };
            });
        };

        const onDialogAction = (result) => {
            const resolve = dialog.value.resolve;
            dialog.value.show = false;
            dialog.value.resolve = null;
            if (resolve) resolve(result);
        };

        watch(activeProjectColor, (newColor) => {
            document.documentElement.style.setProperty('--project-color', newColor);
        }, { immediate: true });

        const applyTheme = () => {
            document.documentElement.classList.toggle('dark', isDark.value);
            localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
        };

        const toggleTheme = () => {
            isDark.value = !isDark.value;
            applyTheme();
            renderAllCharts();
        };

        const updateTimer = () => {
            const startTimeStr = localStorage.getItem('startTime');
            if (!startTimeStr) return;
            
            const diff = new Date() - new Date(startTimeStr);
            elapsedTime.value = WorkService.formatDuration(diff);
        };

        const startTimer = () => {
            updateTimer();
            timerInterval = setInterval(updateTimer, 1000);
        };

        const stopTimer = () => {
            if (timerInterval) clearInterval(timerInterval);
            elapsedTime.value = '00:00:00';
        };

        const loadData = async () => {
            logs.value = await DB.getLogs();
            const storedProjects = await DB.getProjects();
            if (storedProjects.length === 0) {
                const defaultProject = { name: 'General', color: 'oklch(60% 0.18 260)' };
                await DB.saveProject(defaultProject);
                projects.value = [defaultProject];
            } else {
                projects.value = storedProjects;
            }
            renderChart();
        };

        const renderReportChart = async () => {
            await nextTick();
            const canvas = document.getElementById('reportChart');
            if (!canvas || currentView.value !== 'statistics') return;

            if (reportChartInstance) reportChartInstance.destroy();

            const summary = projectSummary.value;
            if (summary.length === 0) return;

            reportChartInstance = new Chart(canvas, {
                type: 'pie',
                data: {
                    labels: summary.map(s => s.name),
                    datasets: [{
                        data: summary.map(s => s.hours),
                        backgroundColor: summary.map(s => s.color),
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: chartTheme.value.text }
                        }
                    }
                }
            });
        };

        watch(currentView, renderAllCharts);

        watch(chartProjectFilter, renderChart);
        watch(projectSummary, renderReportChart);

        const toggleClock = async () => {
            const now = new Date();
            if (!isClockedIn.value) {
                localStorage.setItem('startTime', now.toISOString());
                isClockedIn.value = true;
                startTimer();
            } else {
                const startTime = localStorage.getItem('startTime');
                const duration = WorkService.calcHours(startTime, now);
                const activeProject = localStorage.getItem('activeProject') || 'General';
                
                await DB.saveLog({
                    timeIn: startTime,
                    timeOut: now.toISOString(),
                    hours: duration,
                    project: activeProject,
                    month: now.getMonth(),
                    year: now.getFullYear()
                });
                isClockedIn.value = false;
                stopTimer();
                await loadData();
            }
            localStorage.setItem('isClockedIn', isClockedIn.value.toString());
            if (isClockedIn.value) localStorage.setItem('activeProject', project.value);
        };

        const openProjectModal = (p = null) => {
            if (p && p.name) {
                isEditMode.value = true;
                originalProjectName.value = p.name;
                newProjectData.value = { ...p };
            } else {
                isEditMode.value = false;
                originalProjectName.value = '';
                newProjectData.value = { name: '', color: colorPalette[0] };
            }
            showProjectModal.value = true;
        };

        const confirmAddProject = async () => {
            const { name, color } = newProjectData.value;
            const trimmedName = name.trim();
            if (!trimmedName) return ask(t('appTitle'), t('enterName'), 'alert');

            const exists = projects.value.find(p => p.name === trimmedName);
            if (exists && (!isEditMode.value || trimmedName !== originalProjectName.value)) {
                return ask(t('appTitle'), t('nameExists'), 'alert');
            }

            if (isEditMode.value && trimmedName !== originalProjectName.value) {
                // Prevent renaming the General project
                if (originalProjectName.value === 'General') {
                    return ask(t('appTitle'), t('cannotDeleteGeneral'), 'alert');
                }

                // Batch update for all logs associated with this project
                const affectedLogs = logs.value
                    .filter(l => l.project === originalProjectName.value)
                    .map(l => ({ ...l, project: trimmedName }));

                if (affectedLogs.length > 0) {
                    await DB.updateLogs(affectedLogs);
                }
                
                await DB.deleteProject(originalProjectName.value);
                
                if (localStorage.getItem('activeProject') === originalProjectName.value) {
                    localStorage.setItem('activeProject', trimmedName);
                }
                // Update local selection state
                if (project.value === originalProjectName.value) project.value = trimmedName;
                if (chartProjectFilter.value === originalProjectName.value) chartProjectFilter.value = trimmedName;
            }

            await DB.saveProject({ name: trimmedName, color });
            showProjectModal.value = false;
            await loadData();
        };

        const deleteProject = async (name) => {
            if (name === 'General') return ask(t('appTitle'), t('cannotDeleteGeneral'), 'alert');
            if (await ask(t('appTitle'), t('deleteProjectConfirm', { name }))) {
                // Repair: Cascading update to re-assign logs to 'General'
                const affectedLogs = logs.value
                    .filter(l => l.project === name)
                    .map(l => ({ ...l, project: 'General' }));

                if (affectedLogs.length > 0) {
                    await DB.updateLogs(affectedLogs);
                }

                await DB.deleteProject(name);
                
                // Reset selections if the deleted project was active
                if (project.value === name) project.value = 'General';
                if (chartProjectFilter.value === name) chartProjectFilter.value = 'All';
                
                await loadData();
            }
        };

        const deleteLog = async (id) => {
            if (await ask(t('appTitle'), t('deleteLogConfirm'))) {
                await DB.deleteLog(id);
                await loadData();
            }
        };

        const startEdit = (log) => {
            editingLog.value = log;
            editForm.value = { 
                timeIn: WorkService.toLocalISO(log.timeIn), 
                timeOut: WorkService.toLocalISO(log.timeOut), 
                project: log.project || 'General' 
            };
        };

        const cancelEdit = () => {
            editingLog.value = null;
        };

        const saveEdit = async () => {
            const tIn = new Date(editForm.value.timeIn);
            const tOut = new Date(editForm.value.timeOut);
            await DB.updateLog({
                ...editingLog.value,
                timeIn: tIn.toISOString(),
                timeOut: tOut.toISOString(),
                hours: WorkService.calcHours(tIn, tOut),
                project: editForm.value.project,
                month: tIn.getMonth(),
                year: tIn.getFullYear()
            });
            editingLog.value = null;
            await loadData();
        };

        const exportCSV = () => {
            const csvContent = WorkService.toCSV(logs.value);
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `work_logs_${new Date().getFullYear()}.csv`;
            a.click();
        };

        const importCSV = async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const text = await file.text();
            const data = WorkService.fromCSV(text);
            await DB.saveLogs(data);
            await loadData();
            ask(t('appTitle'), t('importComplete'), 'alert');
        };

        const clearAllData = async () => {
            const step1 = await ask(t('appTitle'), t('dangerClear'));
            if (!step1) return;

            const step2 = await ask(t('appTitle'), t('confirmClear'));
            if (step2) {
                await DB.deleteDatabase();
                localStorage.clear();
                window.location.reload();
            }
        };

        onMounted(() => {
            loadData();
            applyTheme();
            if (isClockedIn.value) {
                startTimer();
                const active = localStorage.getItem('activeProject');
                if (active) project.value = active;
            }

            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./sw.js').catch(err => {
                    console.error('SW registration failed:', err);
                });
            }
        });

        onUnmounted(() => stopTimer());

        return { 
            isClockedIn, toggleClock, stats, exportCSV, importCSV, locale, t, dialog, onDialogAction,
            project, projects, openProjectModal, confirmAddProject, deleteProject, chartProjectFilter,
            showProjectModal, isEditMode, newProjectData, colorPalette, reportRange, historySearch,
            isDark, toggleTheme, currentView, logs, elapsedTime, deleteLog, filteredTotalHours, projectSummary, filteredHistory, clearAllData,
            editingLog, editForm, startEdit, cancelEdit, saveEdit, renderAllCharts
        };
    }
};

(async () => {
    await l18n.init();
    createApp(appConfig).mount('#app');
})();