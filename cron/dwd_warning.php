<?php
$HOANOHO_DIR = exec('. /etc/environment; echo $HOANOHO_DIR');
require_once $HOANOHO_DIR."/includes/dbconnection.php";
require_once $HOANOHO_DIR."/includes/getConfiguration.php";
require_once $HOANOHO_DIR."/includes/simple_html_dom.php";
require_once $HOANOHO_DIR."/includes/pushover.php";

if ($__CONFIG['dwd_region'] != "") {

  /* **************************
     DWD Wetterwarnung für den Kreis
     ************************** */
  $html = file_get_html("http://www.wettergefahren.de/dyn/app/ws/html/reports/".$__CONFIG['dwd_region']."_warning_de.html");

  $dwd_warnung = "";

  if (strlen($html) > 0) {
    $dwd_warning_headline = trim(strip_tags($html->find('h1[class=app_ws_headline]', '0')));

    if (strpos($dwd_warning_headline, "Es ist") !== FALSE || strpos($dwd_warning_headline, "Es sind") !== FALSE) {
      $warning_no = explode(" ", $dwd_warning_headline)[2];

      $dwd_warnung .= trim(strip_tags($html->find('p', 0))) . ": ";

      for ($p = "6"; $p < "15"; $p++) {
        if (strpos($html->find('p', $p), "DWD / ")) {
          break;
        } else {
          $dwd_warnung .= trim(strip_tags($html->find('p', $p)))." ";
        }
      }

      $dwd_warnung .= "- Quelle: Deutscher Wetterdienst";
    }
  }

  $sql = "SELECT data from cron_data where name = 'dwd_warning'";
  $result2 = mysql_query($sql);
  $resultObj2 = null;
  if(mysql_num_rows($result2) > 0)
      $resultObj2 = mysql_fetch_object($result2);

  // nur wenn sich die warnung geändert hat
  if ($resultObj2 != null && strlen($resultObj2->data) != strlen($dwd_warnung)) {
      if (strlen($dwd_warnung) > 0) {
          pushMessageToUsers("Geänderte Wetterwarnung", $dwd_warnung, 1);
      } else {
          pushMessageToUsers("Entwarnung", "Es liegt keine Wetterwarnung mehr vor.", 0);
      }

      $sql = "DELETE FROM cron_data where name = 'dwd_warning'";
      mysql_query($sql);
      $sql = "INSERT INTO cron_data (name, data) values ('dwd_warning','".$dwd_warnung."')";
      mysql_query($sql);
  } elseif ($resultObj2 == null) {
      $sql = "DELETE FROM cron_data where name = 'dwd_warning'";
      mysql_query($sql);
      $sql = "INSERT INTO cron_data (name, data) values ('dwd_warning','".$dwd_warnung."')";
      mysql_query($sql);

      if (strlen($dwd_warnung) > 0) {
          pushMessageToUsers("Neue Wetterwarnung", $dwd_warnung, 1);
      }
  }
}

function pushMessageToUsers($title, $message, $priority)
{
    $sql ="select * from users join usersettings on usersettings.uid = users.uid where pushover_usertoken is not null and pushover_apptoken is not null";
    $result = mysql_query($sql);

    while ($row = mysql_fetch_array($result)) {
        pushMessage($row['pushover_apptoken'], $row['pushover_usertoken'], $title, $message, $priority);
    }
}
?>
