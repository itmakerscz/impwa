export const WorkService = {
    calcHours(start, end) {
        const s = new Date(start);
        const e = new Date(end);
        const diff = e.getTime() - s.getTime();
        return Math.round((diff / (1000 * 60 * 60)) * 100) / 100; // Round to 2 decimal places
    },

    formatDuration(ms) {
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
    },

    toLocalISO(iso) {
        const d = new Date(iso);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    },

    getStats(logs) {
        const now = new Date();
        const total = logs.reduce((sum, log) => sum + log.hours, 0);
        const thisMonth = logs
            .filter(log => log.month === now.getMonth() && log.year === now.getFullYear())
            .reduce((sum, log) => sum + log.hours, 0);
        return {
            total: total.toFixed(2),
            thisMonth: thisMonth.toFixed(2)
        };
    },

    toCSV(logs) {
        const headers = ['TimeIn', 'TimeOut', 'Hours', 'Project'];
        const rows = logs.map(l => [l.timeIn, l.timeOut, l.hours, l.project || 'General'].join(','));
        return [headers.join(','), ...rows].join('\n');
    },

    fromCSV(text) {
        const [header, ...rows] = text.trim().split('\n');
        return rows.map(row => {
            const [timeIn, timeOut, hours, project] = row.split(',');
            return {
                timeIn, timeOut,
                hours: parseFloat(hours),
                project: project || 'General',
                month: new Date(timeIn).getMonth(),
                year: new Date(timeIn).getFullYear()
            };
        });
    },

    getLast7DaysData(logs, projects, filterProject = 'All', locale = 'en') {
        const labels = [];
        const datasetsMap = {};
        const dateLocale = locale === 'cs' ? 'cs-CZ' : 'en-US';

        const targetProjects = filterProject === 'All' ? projects : projects.filter(p => p.name === filterProject);
        
        targetProjects.forEach(p => {
            datasetsMap[p.name] = {
                label: p.name,
                backgroundColor: p.color || 'oklch(60% 0.18 260)',
                data: [],
                borderRadius: filterProject === 'All' ? 0 : 6
            };
        });

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            labels.push(d.toLocaleDateString(dateLocale, { weekday: 'short' }));

            targetProjects.forEach(p => {
                const dayHours = logs
                    .filter(log => String(log.timeIn || log.date || "").startsWith(dateStr) && log.project === p.name)
                    .reduce((sum, log) => sum + log.hours, 0);
                datasetsMap[p.name].data.push(dayHours);
            });
        }
        return { labels, datasets: Object.values(datasetsMap) };
    },

    getProjectSummary(logs, projects, start, end) {
        const filtered = logs.filter(log => {
            const logDate = String(log.timeIn || log.date || "").split('T')[0];
            return (!start || logDate >= start) && (!end || logDate <= end);
        });
        const summary = {};
        filtered.forEach(log => {
            const pName = log.project || 'General';
            summary[pName] = (summary[pName] || 0) + log.hours;
        });
        return Object.entries(summary)
            .map(([name, hours]) => {
                const proj = projects.find(p => p.name === name);
                return { 
                    name, 
                    hours: parseFloat(hours.toFixed(2)),
                    color: proj ? proj.color : 'oklch(60% 0.18 260)'
                };
            })
            .sort((a, b) => b.hours - a.hours);
    }
};