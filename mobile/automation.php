<?php
    require_once dirname(__FILE__).'/../includes/sessionhandler.php';
?>

<html>
    <head>
        <meta charset="UTF-8" />

        <?php require_once dirname(__FILE__).'/includes/mobile-app.php'; ?>

        <link rel="stylesheet" href="css/ratchet.css" type="text/css" media="screen" title="no title" charset="UTF-8">

        <script src="js/ratchet.js"></script>
        <script src="js/standalone.js"></script>

        <title><?php echo $__CONFIG['main_sitetitle'] ?> - Steuerung</title>
    </head>
    <body>
        <header class="bar-title">
            <h1 class="title">Steuerung</h1>
        </header>

        <div class="content">
            <ul class="list">
                <?php
                    $sql = "SELECT * FROM device_floors WHERE position = 0 order by position asc";
                    $result = mysql_query($sql);
                    while ($floor = mysql_fetch_object($result)) {
                        echo "<li class=\"list-divider\">".$floor->name."</li>";
                        $sql2 = "SELECT * FROM devices where floor_id = ".$floor->floor_id." and isHidden != 'on' order by name asc";
                        $result2 = mysql_query($sql2);
                        while ($device = mysql_fetch_object($result2)) {
                            echo "<li><a href=\"device.php?device=".$device->dev_id."\" data-transition=\"slide-in\" data-ignore=\"push\">".$device->name."</a>";
                              echo "<span class=\"chevron\"></span></li>";
                        }
                    }

                    $sql = "SELECT *, (select count(room_id) from rooms where rooms.floor_id = device_floors.floor_id) as roomcount FROM device_floors WHERE position > 0 order by position asc";
                    $result = mysql_query($sql);
                    while ($floor = mysql_fetch_object($result)) {
                        echo "<li class=\"list-divider\">".$floor->name."</li>";
                        $sql2 = "SELECT * FROM rooms where floor_id = ".$floor->floor_id." order by name asc";
                        $result2 = mysql_query($sql2);
                        while ($room = mysql_fetch_object($result2)) {
                            echo "<li><a href=\"room.php?room=".$room->room_id."\" data-transition=\"slide-in\">".$room->name."</a>";
                              echo "<span class=\"chevron\"></span></li>";
                        }
                    }
                ?>
            </ul>
            <br><br><br>
        </div>
        <?php require_once "includes/nav.php"; ?>
    </body>
</html>
