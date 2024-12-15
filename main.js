// Add event listener to the button in the hero section
document.querySelector('.hero button').addEventListener('click', function() {
    // Scroll to the introduction section when the button is clicked
    document.querySelector('.introduction').scrollIntoView({ behavior: 'smooth' });
});
