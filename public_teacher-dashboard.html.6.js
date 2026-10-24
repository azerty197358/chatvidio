
    setTimeout(function() {
        var loader = document.getElementById('platformPreloader');
        if (loader) {
            loader.classList.add('fade-out');
            loader.style.opacity = '0';
            loader.style.pointerEvents = 'none';
            setTimeout(function() { loader.style.display = 'none'; }, 200);
        }
    }, 500);
