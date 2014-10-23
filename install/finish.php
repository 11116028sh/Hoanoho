<?php
if(!isset($_SESSION)){
    session_start();
}
?>

<html>
    <head>
        <meta charset="UTF-8" />

        <link rel="stylesheet" href="style.css" type="text/css" media="screen" title="no title" charset="UTF-8">

        <title>Installation</title>
    </head>
<body>
    <section class="install_main">
        <form class="install" action="../login.php" method="post">
            <h1><span class="log-in">ABSCHLUSS</span></h1>
                <div class="value">Die Installation wurde erfolgreich abgeschlossen!</div>
                <div class="value">&nbsp;</div>
                <div class="value">Die Anmeldung ist nun möglich mittels:</div>
                <div class="value"><b>Benutzername: manager</b></div>
                <div class="value"><b>Passwort: <?php echo $_SESSION['adminpw']; ?></b></div>
                <input type="submit" name="submit" value="Anmelden">
        </form>​​
    </section>
</body>
</html>

<?php
session_destroy();
?>
