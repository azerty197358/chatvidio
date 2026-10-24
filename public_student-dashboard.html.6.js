
        // Safe fallback stubs to prevent any ReferenceError before packages-student.js loads
        window.setStudentPackageLevelFilter = window.setStudentPackageLevelFilter || function(level) { console.warn('setStudentPackageLevelFilter pending load', level); };
        window.setStudentPackageTab = window.setStudentPackageTab || function(tab) { console.warn('setStudentPackageTab pending load', tab); };
        window.loadStudentPackages = window.loadStudentPackages || function() { console.warn('loadStudentPackages pending load'); };
        window.openPackageDetailsModal = window.openPackageDetailsModal || function(id) { console.warn('openPackageDetailsModal pending load', id); };
        window.openSubscribePackageModal = window.openSubscribePackageModal || function(id) { console.warn('openSubscribePackageModal pending load', id); };
    