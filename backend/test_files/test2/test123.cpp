#include <array>
#include <chrono>
#include <iostream>
#include <thread>

#include <unitree/idl/go2/LowCmd_.hpp>
#include <unitree/idl/hg/LowState_.hpp>
#include <unitree/robot/channel/channel_publisher.hpp>
#include <unitree/robot/channel/channel_subscriber.hpp>

static const std::string kTopicArmSDK = "rt/arm_sdk";
static const std::string kTopicState = "rt/lowstate";
constexpr float kPi = 3.141592654;
constexpr float kPi_2 = 1.57079632;



int version_debug = 1541;



#include <cmath>

using namespace std;

// Длины плеч
const double L1 = 1.0; // Длина первого сегмента
const double L2 = 1.0; // Длина второго сегмента

// Преобразование радиан в градусы
double radToDeg(double radians)
{
  return radians * (180.0 / M_PI);
}

// Основная функция для расчета углов моторов
void calculateAngles(double x, double y, double z, double &angle1, double &angle2, double &angle3)
{
  double r = sqrt(x * x + y * y);
  double D = sqrt(r * r + (z - L1) * (z - L1));

  // Проверка на достижимость
  if (D > (L1 + L2) || D < abs(L1 - L2))
  {
    cout << "Error." << endl;
    return;
  }

  // Угл для поворота
  double theta1 = atan2(y, x);
  double angle1_rad = theta1;

  // Угол для локтя
  double theta2 = acos((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2));
  double angle2_rad = theta2;

  // Угол для подъёма
  double phi = atan2(z - L1, r);
  double angle3_rad = phi - theta2;

  angle1 = angle1_rad;
  angle2 = angle2_rad;
  angle3 = angle3_rad;
}

enum JointIndex
{
  // Right leg
  kRightHipYaw = 8,
  kRightHipRoll = 0,
  kRightHipPitch = 1,
  kRightKnee = 2,
  kRightAnkle = 11,
  // Left leg
  kLeftHipYaw = 7,
  kLeftHipRoll = 3,
  kLeftHipPitch = 4,
  kLeftKnee = 5,
  kLeftAnkle = 10,

  kWaistYaw = 6,

  kNotUsedJoint = 9,

  // Right arm
  kRightShoulderPitch = 12,
  kRightShoulderRoll = 13,
  kRightShoulderYaw = 14,
  kRightElbow = 15,
  // Left arm
  kLeftShoulderPitch = 16,
  kLeftShoulderRoll = 17,
  kLeftShoulderYaw = 18,
  kLeftElbow = 19,

};

int main(int argc, char const *argv[])
{
  double x, y, z;
  double angle1, angle2, angle3;

  // Ввод конечной точки
  x = 1;
  y = 0;
  z = 0.5;
  calculateAngles(x, y, z, angle1, angle2, angle3);
  std::cout << "Angle1: " << angle1 << std::endl;
  std::cout << "Angle2: " << angle2 << std::endl;
  std::cout << "Angle3: " << angle3 << std::endl;
  if (argc < 2)
  {
    std::cout << "Usage: " << argv[0] << " networkInterface" << std::endl;
    exit(-1);
  }

  unitree::robot::ChannelFactory::Instance()->Init(0, argv[1]);

  unitree::robot::ChannelPublisherPtr<unitree_go::msg::dds_::LowCmd_>
      arm_sdk_publisher;
  unitree_go::msg::dds_::LowCmd_ msg;

  arm_sdk_publisher.reset(
      new unitree::robot::ChannelPublisher<unitree_go::msg::dds_::LowCmd_>(
          kTopicArmSDK));
  arm_sdk_publisher->InitChannel();

  unitree::robot::ChannelSubscriberPtr<unitree_hg::msg::dds_::LowState_>
      low_state_subscriber;

  // create subscriber
  unitree_hg::msg::dds_::LowState_ state_msg;
  low_state_subscriber.reset(
      new unitree::robot::ChannelSubscriber<unitree_hg::msg::dds_::LowState_>(
          kTopicState));
  low_state_subscriber->InitChannel([&](const void *msg)
                                    {
        auto s = ( const unitree_hg::msg::dds_::LowState_* )msg;
        memcpy( &state_msg, s, sizeof( unitree_hg::msg::dds_::LowState_ ) ); }, 1);

  std::array<JointIndex, 9> arm_joints = {
      JointIndex::kLeftShoulderPitch, JointIndex::kLeftShoulderRoll,
      JointIndex::kLeftShoulderYaw, JointIndex::kLeftElbow,
      JointIndex::kRightShoulderPitch, JointIndex::kRightShoulderRoll,
      JointIndex::kRightShoulderYaw, JointIndex::kRightElbow, JointIndex::kWaistYaw};

  std::array<JointIndex, 4> arm_left = {
      JointIndex::kLeftShoulderPitch, JointIndex::kLeftShoulderRoll,
      JointIndex::kLeftShoulderYaw, JointIndex::kLeftElbow};
  std::array<JointIndex, 4> arm_right = {
      JointIndex::kRightShoulderPitch, JointIndex::kRightShoulderRoll,
      JointIndex::kRightShoulderYaw, JointIndex::kRightElbow};

  float weight = 0.f;
  float weight_rate = 0.2f;

  float kp = 60.f;
  float kd = 1.5f;
  float dq = 0.f;
  float tau_ff = 0.f;

  float control_dt = 0.02f;
  float max_joint_velocity = 0.5f;

  float control_dt_num = 0.001f;

  float delta_weight = weight_rate * control_dt;
  float max_joint_delta = max_joint_velocity * control_dt;
  auto sleep_time =
      std::chrono::milliseconds(static_cast<int>(control_dt * 25 / 0.001f)); // added *10 / 2

  std::array<float, 9> init_pos{};

  std::array<float, 9> target_pos1 = {0, 0.78f, 0, kPi_2, // левая рука 45 градусов 0,78 радиан
                                      0, -0.78f, 0, kPi_2,
                                      0};

  std::array<float, 9> target_pos2 = {0, 0.25f, 0, kPi_2, // левая рука 45 градусов 0,78 радиан
                                      0, -0.25f, 0, kPi_2,
                                      0};

  std::array<float, 9> target_pos3 = {-0.78f, 0.5, 0, kPi_2, // левая рука
                                      -kPi_2, -0.5, 0, kPi_2,
                                      0.f};

  std::array<float, 9> target_pos4 = {2.87, 0.1, 0, kPi_2,  // левая рука
                                      2.87, -0.1, 0, kPi_2, // правая рука
                                      0.f};

  std::array<float, 9> target_pos5 = {0.f, 2.2f, 0.f, kPi_2, // левая рука
                                      0.f, -2.2f, 0.f, kPi_2,
                                      -0.5};

  std::array<float, 9> target_pos6 = {0.f, 3.2f, 0.f, kPi_2, // левая рука deb
                                      0.f, -3.2f, 0.f, kPi_2,
                                      0};

  std::array<float, 9> target_pos7 = {0.39f, -1.3f, 0.f, kPi_2, // левая рука deb
                                      0.39f, 1.3f, 0.f, kPi_2,
                                      0};

  std::array<float, 9> target_pos8 = {0.f, 0.f, 0.f, 0, // левая рука deb2
                                      0.f, 0.f, 0.f, 0,
                                      0.f};


  // Вращение рук
  std::array<float, 9> target_pos_vrash_1 = {0.f, 0.18f, 0.f, kPi_2, // левая рука вращение рук
                                            0.f, -0.18f, 0.f, kPi_2,
                                            0.f};
  std::array<float, 9> target_pos_vrash_1_1 = {-kPi_2/2, 0.5f, 0.f, kPi_2, // левая рука вращение рук  //0.3
                                            -kPi_2/2, -0.5f, 0.1f, kPi_2,
                                            0.f};

  std::array<float, 9> target_pos_vrash_2 = {-kPi_2-0.1f, kPi_2+0.3f, 0.f, kPi_2, // левая рука вращение рук  //0.3
                                            -kPi_2-0.1f, -kPi_2-0.3f, 0.1f, kPi_2,
                                            0.f};
  
  std::array<float, 9> target_pos_vrash_3 = {kPi_2-0.1f, kPi_2+0.26f, 0.f, kPi_2, // левая рука вращение рук //0.15
                                            kPi_2-0.1f, -kPi_2-0.26f, 0.f, kPi_2,
                                            0.f};

  std::array<float, 9> target_pos_vrash_4 = {1.f, kPi_2-0.8f, 0.f, kPi_2, // левая рука вращение рук
                                            1.f, -kPi_2+0.8f, 0.f, kPi_2,
                                            0.f};
  
  std::array<float, 9> target_pos_vrash_5 = {0.7f, 0.25f, 0.f, kPi_2, // левая рука вращение рук
                                            0.7f, -0.25f, 0.f, kPi_2,
                                            0.f};
                                          
  std::array<float, 9> target_pos_vrash_prepos = {0.f, 0.18f, 0.f, kPi_2, // левая рука вращение рук
                                            0.f, -0.18f, 0.f, kPi_2,
                                            0.f};


  //танец 2
  std::array<float, 9> target_pos_dance2_1 = {0.78f, -0.18f, 1.4f, kPi_2 + 0.18f, // левая рука dance2
                                              -0.39f, -0.18f, -1.7f, kPi_2 - 0.0f,
                                              -0.1f};
  std::array<float, 9> target_pos_dance2_2 = {0.78f, 0.18f, 1.4f, kPi_2 + 0.18f, // левая рука dance2
                                              -0.39f, 0.18f, -1.7f, kPi_2 - 0.0f,
                                              0.f};
  std::array<float, 9> target_pos_dance2_3 = {0.78f, -0.18f, 1.4f, kPi_2 + 0.18f, // левая рука dance2
                                              -0.39f, -0.18f, -1.7f, kPi_2 - 0.0f,
                                              -0.1f};

  std::array<float, 9> target_pos_dance2_prepos = {0.19f, 0.3f, 1.4f, kPi_2, // левая рука dance2
                                                   0.f, -0.3f, -1.4f, kPi_2,
                                                   0.f};

  std::array<float, 9> target_pos_dance2_4 = {-0.39f, -0.18f, 1.7f, kPi_2 + 0.0f, // левая рука dance2
                                              0.78f, -0.18f, -1.4f, kPi_2 + 0.0f,
                                              0.1f};
  std::array<float, 9> target_pos_dance2_5 = {-0.39f, 0.18f, 1.7f, kPi_2 + 0.0f, // левая рука dance2
                                              0.78f, 0.18f, -1.4f, kPi_2 + 0.18f,
                                              0.f};
  std::array<float, 9> target_pos_dance2_6 = {-0.39f, -0.18f, 1.7f, kPi_2 + 0.0f, // левая рука dance2
                                              0.78f, -0.18f, -1.4f, kPi_2 + 0.0f,
                                              0.1f};
  //
  float delta_clamps[] = {};

  // wait for init
  std::cout << "VERSION " << version_debug << std::endl;
  std::cout << "Press ENTER to init arms ...";
  std::cin.get();

  // get current joint position
  std::array<float, 9> current_jpos{};
  std::cout << "Current joint position: ";
  for (int i = 0; i < arm_joints.size(); ++i)
  {
    current_jpos.at(i) = state_msg.motor_state().at(arm_joints.at(i)).q();
    std::cout << current_jpos.at(i) << " ";
  }
  std::cout << std::endl;

  // set init pos
  std::cout << "Initailizing arms ...";
  float init_time = 0.1f;
  int init_time_steps = static_cast<int>(init_time / control_dt);

  for (int i = 0; i < init_time_steps; ++i)
  {
    // set weight
    weight = 1.0;
    msg.motor_cmd().at(JointIndex::kNotUsedJoint).q(weight);
    float phase = 1.0 * i / init_time_steps;
    std::cout << "Phase: " << phase << std::endl;

    // set control joints
    for (int j = 0; j < init_pos.size(); ++j)
    {
      msg.motor_cmd().at(arm_joints.at(j)).q(init_pos.at(j) * phase + current_jpos.at(j) * (1 - phase));
      msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
      msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
      msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
      msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
    }

    // send dds msg
    arm_sdk_publisher->Write(msg);

    // sleep
    std::this_thread::sleep_for(sleep_time);
  }

  std::cout << "Done!" << std::endl;

  // wait for control
  // std::cout << "Press ENTER to start arm ctrl ..." << std::endl;
  // std::cin.get();

  // start control
  sleep_time = std::chrono::milliseconds(static_cast<int>((control_dt / 0.005f) / 1.5));
  /////////////1 step///////////////////////////
  std::cout << "Start arm ctrl!" << std::endl;
  float period = 5.f;

  int phase_time = 200; // mill
  int phase_koef = 0; // коэффицент кривизны 

  int num_time_steps = phase_time; //(period / control_dt);
  //phase_koef = phase_koef * (phase_time / num_time_steps)
  auto sleep_time_num = std::chrono::milliseconds(static_cast<int>(((phase_time / num_time_steps))));


  std::array<float, 9> current_jpos_des{};
  for (int count = 0; count <= 1; ++count)
  {
    // std::array<float, 9> current_jpos_des{};      //Возвращение в исходную позу

    // lift arms up
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des
      for (int j = 0; j < target_pos1.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos1.at(j) - current_jpos_des.at(j),
                       -max_joint_delta, max_joint_delta);
      }

      // set control joints
      for (int j = 0; j < target_pos1.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(sleep_time);
    }

    /////////////2 step///////////////////////////
  } // ENDFOR

  for (int count = 0; count <= 20; ++count)
  {

    delta_clamps[target_pos_dance2_prepos.size()] = {}; // для расстояний
    for (int j = 0; j < target_pos_dance2_prepos.size(); ++j)
    {
      //int delta_clamps_prop = ( ((num_time_steps * (phase_koef - 1)) / (pow(phase_koef, num_time_steps) - 1)) );
      delta_clamps[j] = (abs((target_pos_dance2_prepos.at(j) - current_jpos_des.at(j)) / num_time_steps)); // добавляем равномерное значение для каждого движения
      //delta_clamps[j] = ( ((abs(target_pos_dance2_prepos.at(j) - current_jpos_des.at(j)) * (phase_koef - 1)) / (pow(phase_koef, num_time_steps) - 1)) );
    }
    
    for (int i = 0; i < num_time_steps; ++i)  // кол-во движений до точки
    {
      // update jpos des
      for (int j = 0; j < target_pos_dance2_prepos.size(); ++j) // в теории можно просто прибавлять равномерное значение со знаком, но есть шанс накопления ошибки плавающего значения
      {
        //int delta_clamps_prop = ( ((num_time_steps * (phase_koef - 1)) / (pow(phase_koef, num_time_steps) - 1)) );
        //float dt_clm = (delta_clamps[j] * (pow(phase_koef, i) - 1));
        current_jpos_des.at(j) +=
            std::clamp(target_pos_dance2_prepos.at(j) - current_jpos_des.at(j), -delta_clamps[j], 
                       delta_clamps[j]); // для каждого мотора своё ограничение на кол-во движений, берём clamp от расстояния до состояния мотора
      }

      for (int j = 0; j < target_pos_dance2_prepos.size(); ++j) // готовим пакет
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      arm_sdk_publisher->Write(msg); // отправляем пакет промежуточного действия

      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) )); // ставим тайминг
    }

    delta_clamps[target_pos_dance2_1.size()] = {};
    for (int j = 0; j < target_pos_dance2_1.size(); ++j)
    {
      delta_clamps[j] = (abs((target_pos_dance2_1.at(j) - current_jpos_des.at(j)) / num_time_steps));
    }
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des
      for (int j = 0; j < target_pos_dance2_1.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos_dance2_1.at(j) - current_jpos_des.at(j), -delta_clamps[j],
                       delta_clamps[j]);
      }

      // set control joints
      for (int j = 0; j < target_pos_dance2_1.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) )); // ((phase_time / num_time_steps) * (i + 1) * phase_koef)
    }

    delta_clamps[target_pos_dance2_2.size()] = {};
    for (int j = 0; j < target_pos_dance2_2.size(); ++j)
    {
      delta_clamps[j] = (abs((target_pos_dance2_2.at(j) - current_jpos_des.at(j)) / num_time_steps));
    }
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des
      for (int j = 0; j < target_pos_dance2_2.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos_dance2_2.at(j) - current_jpos_des.at(j), -delta_clamps[j],
                       delta_clamps[j]);
      }

      // set control joints
      for (int j = 0; j < target_pos_dance2_2.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) ));
    }

    delta_clamps[target_pos_dance2_3.size()] = {};
    for (int j = 0; j < target_pos_dance2_3.size(); ++j)
    {
      delta_clamps[j] = (abs((target_pos_dance2_3.at(j) - current_jpos_des.at(j)) / num_time_steps));
    }
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des
      for (int j = 0; j < target_pos_dance2_3.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos_dance2_3.at(j) - current_jpos_des.at(j), -delta_clamps[j],
                       delta_clamps[j]);
      }

      // set control joints
      for (int j = 0; j < target_pos_dance2_3.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) ));
    }
    delta_clamps[target_pos_dance2_prepos.size()] = {};
    for (int j = 0; j < target_pos_dance2_prepos.size(); ++j)
    {
      delta_clamps[j] = (abs((target_pos_dance2_prepos.at(j) - current_jpos_des.at(j)) / num_time_steps));
    }
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des
      for (int j = 0; j < target_pos_dance2_prepos.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos_dance2_prepos.at(j) - current_jpos_des.at(j), -delta_clamps[j],
                       delta_clamps[j]);
      }

      // set control joints
      for (int j = 0; j < target_pos_dance2_prepos.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) ));
    }

    delta_clamps[target_pos_dance2_4.size()] = {};
    for (int j = 0; j < target_pos_dance2_4.size(); ++j)
    {
      delta_clamps[j] = (abs((target_pos_dance2_4.at(j) - current_jpos_des.at(j)) / num_time_steps));
    }
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des
      for (int j = 0; j < target_pos_dance2_4.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos_dance2_4.at(j) - current_jpos_des.at(j), -delta_clamps[j],
                       delta_clamps[j]);
      }

      // set control joints
      for (int j = 0; j < target_pos_dance2_4.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) ));
    }

    delta_clamps[target_pos_dance2_5.size()] = {};
    for (int j = 0; j < target_pos_dance2_5.size(); ++j)
    {
      delta_clamps[j] = (abs((target_pos_dance2_5.at(j) - current_jpos_des.at(j)) / num_time_steps));
    }
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des
      for (int j = 0; j < target_pos_dance2_5.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos_dance2_5.at(j) - current_jpos_des.at(j), -delta_clamps[j],
                       delta_clamps[j]);
      }

      // set control joints
      for (int j = 0; j < target_pos_dance2_5.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) ));
    }

    delta_clamps[target_pos_dance2_6.size()] = {};
    for (int j = 0; j < target_pos_dance2_6.size(); ++j)
    {
      delta_clamps[j] = (abs((target_pos_dance2_6.at(j) - current_jpos_des.at(j)) / num_time_steps));
    }
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des
      for (int j = 0; j < target_pos_dance2_6.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos_dance2_6.at(j) - current_jpos_des.at(j), -delta_clamps[j],
                       delta_clamps[j]);
      }

      // set control joints
      for (int j = 0; j < target_pos_dance2_6.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) ));
    }
  }
  
  //руки вверх
  /*phase_time = 500;
  phase_koef = 0; // коэффицент кривизны

  // START NEXT MOTION
  for (int count = 0; count <= 15; ++count)
  {
    phase_time = 500;
    num_time_steps = phase_time;
    delta_clamps[target_pos_vrash_1.size()] = {};
  
    for (int j = 0; j < target_pos_vrash_1.size(); ++j)
    {
      delta_clamps[j] = (abs((target_pos_vrash_1.at(j) - current_jpos_des.at(j)) / num_time_steps));
    }
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des
      for (int j = 0; j < target_pos_vrash_1.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos_vrash_1.at(j) - current_jpos_des.at(j), -delta_clamps[j],
                       delta_clamps[j]);
      }

      // set control joints
      for (int j = 0; j < target_pos_vrash_1.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) ));
    }

    delta_clamps[target_pos_vrash_1_1.size()] = {};
  
    for (int j = 0; j < target_pos_vrash_1_1.size(); ++j)
    {
      delta_clamps[j] = (abs((target_pos_vrash_1_1.at(j) - current_jpos_des.at(j)) / num_time_steps));
    }
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des
      for (int j = 0; j < target_pos_vrash_1_1.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos_vrash_1_1.at(j) - current_jpos_des.at(j), -delta_clamps[j],
                       delta_clamps[j]);
      }

      // set control joints
      for (int j = 0; j < target_pos_vrash_1_1.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) ));
    }

    delta_clamps[target_pos_vrash_2.size()] = {};
    for (int j = 0; j < target_pos_vrash_2.size(); ++j)
    {
      delta_clamps[j] = (abs((target_pos_vrash_2.at(j) - current_jpos_des.at(j)) / num_time_steps));
    }
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des

      for (int j = 0; j < target_pos_vrash_2.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos_vrash_2.at(j) - current_jpos_des.at(j), -delta_clamps[j],
                       delta_clamps[j]);
      }

      // set control joints
      for (int j = 0; j < target_pos_vrash_2.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) ));
    }
    phase_time = 400; // mill
    num_time_steps = phase_time;

    delta_clamps[target_pos_vrash_3.size()] = {};
    for (int j = 0; j < target_pos_vrash_3.size(); ++j)
    {
      delta_clamps[j] = (abs((target_pos_vrash_3.at(j) - current_jpos_des.at(j)) / num_time_steps));
    }
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des

      for (int j = 0; j < target_pos_vrash_3.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos_vrash_3.at(j) - current_jpos_des.at(j), -delta_clamps[j],
                       delta_clamps[j]);
      }

      // set control joints
      for (int j = 0; j < target_pos_vrash_3.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) ));
    }

    phase_time = 500; // mill
    num_time_steps = phase_time;
    delta_clamps[target_pos_vrash_4.size()] = {};
    for (int j = 0; j < target_pos_vrash_4.size(); ++j)
    {
      delta_clamps[j] = (abs((target_pos_vrash_4.at(j) - current_jpos_des.at(j)) / num_time_steps));
    }
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des

      for (int j = 0; j < target_pos_vrash_4.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos_vrash_4.at(j) - current_jpos_des.at(j), -delta_clamps[j],
                       delta_clamps[j]);
      }

      // set control joints
      for (int j = 0; j < target_pos_vrash_4.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) ));
    }

    phase_time = 450; // mill
    num_time_steps = phase_time;
    delta_clamps[target_pos_vrash_5.size()] = {};
    for (int j = 0; j < target_pos_vrash_5.size(); ++j)
    {
      delta_clamps[j] = (abs((target_pos_vrash_5.at(j) - current_jpos_des.at(j)) / num_time_steps));
    }
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des

      for (int j = 0; j < target_pos_vrash_5.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos_vrash_5.at(j) - current_jpos_des.at(j), -delta_clamps[j],
                       delta_clamps[j]);
      }

      // set control joints
      for (int j = 0; j < target_pos_vrash_5.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) ));
    }
    phase_time = 300; // mill
    num_time_steps = phase_time;
    delta_clamps[target_pos_vrash_prepos.size()] = {};
    for (int j = 0; j < target_pos_vrash_prepos.size(); ++j)
    {
      delta_clamps[j] = (abs((target_pos_vrash_prepos.at(j) - current_jpos_des.at(j)) / num_time_steps));
    }
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des

      for (int j = 0; j < target_pos_vrash_prepos.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos_vrash_prepos.at(j) - current_jpos_des.at(j), -delta_clamps[j],
                       delta_clamps[j]);
      }

      // set control joints
      for (int j = 0; j < target_pos_vrash_prepos.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) ));
    }
  }*/ //руки вверх

  /*
  phase_time = 1000; // mill
  phase_koef = 0; // коэффицент кривизны 

  num_time_steps = phase_time;\
  // START NEXT MOTION
  for (int count = 0; count <= 3; ++count)
  {
    // std::array<float, 9> current_jpos_des{};      //Возвращение в исходную позу

    // lift arms up
    delta_clamps[target_pos3.size()] = {};
    for (int j = 0; j < target_pos3.size(); ++j)
    {
      delta_clamps[j] = (abs((target_pos3.at(j) - current_jpos_des.at(j)) / num_time_steps));
    }
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des
      for (int j = 0; j < target_pos3.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos3.at(j) - current_jpos_des.at(j), -delta_clamps[j],
                       delta_clamps[j]);
      }

      // set control joints
      for (int j = 0; j < target_pos3.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) ));
    }

    delta_clamps[target_pos2.size()] = {};
    for (int j = 0; j < target_pos2.size(); ++j)
    {
      delta_clamps[j] = (abs((target_pos2.at(j) - current_jpos_des.at(j)) / num_time_steps));
    }
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des

      for (int j = 0; j < target_pos2.size(); ++j)
      {
        // float join_distance_delta = ((abs(target_pos2.at(j) - current_jpos_des.at(j)) / num_time_steps));
        current_jpos_des.at(j) +=
            std::clamp(target_pos2.at(j) - current_jpos_des.at(j), -delta_clamps[j],
                       delta_clamps[j]);
      }

      // set control joints
      for (int j = 0; j < target_pos2.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(std::chrono::milliseconds( ((1 + i * (phase_koef / num_time_steps)) * (phase_time / num_time_steps)) ));
    }
    /////////////DEBUG 1//////////////////////////
    /*std::cout << "Press ENTER to DEGUB 1 ...";
    std::cin.get();
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des
      for (int j = 0; j < target_pos6.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos6.at(j) - current_jpos_des.at(j), -max_joint_delta,
                       max_joint_delta);
      }

      // set control joints
      for (int j = 0; j < target_pos6.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(sleep_time);
    }
    /////////////DEBUG 2//////////////////////////
    std::cout << "Press ENTER to DEBUG 2 ...";
    std::cin.get();
    for (int i = 0; i < num_time_steps; ++i)
    {
      // update jpos des
      for (int j = 0; j < target_pos7.size(); ++j)
      {
        current_jpos_des.at(j) +=
            std::clamp(target_pos7.at(j) - current_jpos_des.at(j), -max_joint_delta,
                       max_joint_delta);
      }

      // set control joints
      for (int j = 0; j < target_pos7.size(); ++j)
      {
        msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
        msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
        msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
        msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
        msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
      }

      // send dds msg
      arm_sdk_publisher->Write(msg);

      // sleep
      std::this_thread::sleep_for(sleep_time);
    }
  }*/
 
  /////////////DEBUG 3//////////////////////////
  // std::cout << "Press ENTER to DEBUG 3 ...";
  // std::cin.get();
  std::this_thread::sleep_for(sleep_time);
  for (int i = 0; i < num_time_steps; ++i)
  {
    // update jpos des
    for (int j = 0; j < target_pos8.size(); ++j)
    {
      current_jpos_des.at(j) +=
          std::clamp(target_pos8.at(j) - current_jpos_des.at(j), -max_joint_delta,
                     max_joint_delta);
    }

    // set control joints
    for (int j = 0; j < target_pos8.size(); ++j)
    {
      msg.motor_cmd().at(arm_joints.at(j)).q(current_jpos_des.at(j));
      msg.motor_cmd().at(arm_joints.at(j)).dq(dq);
      msg.motor_cmd().at(arm_joints.at(j)).kp(kp);
      msg.motor_cmd().at(arm_joints.at(j)).kd(kd);
      msg.motor_cmd().at(arm_joints.at(j)).tau(tau_ff);
    }

    // send dds msg
    arm_sdk_publisher->Write(msg);

    // sleep
    std::this_thread::sleep_for(sleep_time);
  }
  //} ENDFOR

  // stop control
  std::cout << "Stoping arm ctrl ...";
  float stop_time = 2.0f;
  int stop_time_steps = static_cast<int>(stop_time / control_dt);

  for (int i = 0; i < stop_time_steps; ++i)
  {
    // increase weight
    weight -= delta_weight;
    weight = std::clamp(weight, 0.f, 1.f);

    // set weight
    msg.motor_cmd().at(JointIndex::kNotUsedJoint).q(weight);

    // send dds msg
    arm_sdk_publisher->Write(msg);

    // sleep
    std::this_thread::sleep_for(sleep_time);
  }

  std::cout << "Done!" << std::endl;

  return 0;
}
