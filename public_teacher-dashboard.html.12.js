
      document.addEventListener('submit', function (event) {
        if (event.target && event.target.closest && event.target.closest('#groupsChatView')) {
          event.preventDefault();
          event.stopPropagation();
        }
      }, true);
    